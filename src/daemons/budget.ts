/**
 * Budget Daemon (Income-Splitting)
 *
 * Tracks income deltas, splits incoming money across weighted buckets,
 * and lets each bucket accumulate a running balance. Single-tier, no
 * ROI logic. Consumers spend freely up to their bucket's balance.
 *
 * Usage: run daemons/budget.js
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import { publishStatus } from "/lib/ports";
import { writeDefaultConfig, getConfigNumber } from "/lib/config";
import {
  STATUS_PORTS,
  BUDGET_CONTROL_PORT,
  BudgetStatus,
  BucketState,
  BudgetControlMessage,
} from "/types/ports";
import {
  DEFAULT_WEIGHTS,
  PersistedBudgetState,
  createDefaultPersistedState,
  calculateIncome,
  isAugReset,
  splitIncome,
  computeEffectiveWeights,
  handleCompletion,
} from "/controllers/budget";

const C = COLORS;
const BALANCE_FILE = "/data/budget-balances.json";
const DONE_MARKER_FILE = "/data/budget-done.txt";
const INCOME_HISTORY_SIZE = 15;

/** @ram 4 */
export function main(ns: NS): Promise<void> {
  ns.ramOverride(4);
  return daemon(ns);
}

// === STATE ===

let state: PersistedBudgetState;
let prevCash = 0;
let purchasesThisTick = 0;
const incomeHistory: number[] = [];

// === PERSISTENCE ===

function loadState(ns: NS): PersistedBudgetState {
  if (ns.fileExists(BALANCE_FILE)) {
    try {
      const raw = ns.read(BALANCE_FILE);
      const loaded = JSON.parse(raw) as Partial<PersistedBudgetState>;
      const defaults = createDefaultPersistedState();

      // Merge loaded state with defaults (handles new buckets)
      const merged: PersistedBudgetState = {
        balances: { ...defaults.balances, ...loaded.balances },
        lifetimeSpent: { ...defaults.lifetimeSpent, ...loaded.lifetimeSpent },
        weights: { ...defaults.weights, ...loaded.weights },
        activeFlags: { ...defaults.activeFlags, ...loaded.activeFlags },
        caps: { ...defaults.caps, ...loaded.caps },
        rushBucket: loaded.rushBucket ?? null,
      };

      return merged;
    } catch {
      // Corrupt file, start fresh
    }
  }
  return createDefaultPersistedState();
}

function saveState(ns: NS): void {
  ns.write(BALANCE_FILE, JSON.stringify(state), "w");
}

// === CONTROL PORT ===

function drainControlPort(ns: NS): void {
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  while (!port.empty()) {
    const data = port.read();
    if (data === "NULL PORT DATA") break;
    try {
      const msg = JSON.parse(data as string) as BudgetControlMessage;
      handleMessage(ns, msg);
    } catch {
      // Invalid message, skip
    }
  }
}

function handleMessage(ns: NS, msg: BudgetControlMessage): void {
  // Ensure the bucket exists in state
  ensureBucket(msg.bucket);

  switch (msg.action) {
    case "purchased":
      if (msg.amount !== undefined && msg.amount > 0) {
        state.balances[msg.bucket] = Math.max(0, (state.balances[msg.bucket] ?? 0) - msg.amount);
        state.lifetimeSpent[msg.bucket] = (state.lifetimeSpent[msg.bucket] ?? 0) + msg.amount;
        purchasesThisTick += msg.amount;
        ns.print(`  ${C.green}BUY${C.reset} ${msg.bucket}: ${ns.formatNumber(msg.amount)} (${msg.reason ?? ""})`);
      }
      break;

    case "done":
      if (state.activeFlags[msg.bucket]) {
        ns.print(`  ${C.yellow}DONE${C.reset} ${msg.bucket}: closing bucket`);
        handleCompletion(msg.bucket, state.balances, state.weights, state.activeFlags);
      }
      break;

    case "report-cap":
      if (msg.cap !== undefined) {
        // Cap = current lifetimeSpent + remaining cost
        state.caps[msg.bucket] = (state.lifetimeSpent[msg.bucket] ?? 0) + msg.cap;
        ns.print(`  ${C.cyan}CAP${C.reset} ${msg.bucket}: ${ns.formatNumber(msg.cap)} remaining`);
      }
      break;

    case "rush":
      state.rushBucket = msg.bucket;
      ns.print(`  ${C.yellow}RUSH${C.reset} ${msg.bucket}: 100% income`);
      break;

    case "cancel-rush":
      state.rushBucket = null;
      ns.print(`  ${C.cyan}RUSH OFF${C.reset}`);
      break;

    case "update-weight":
      if (msg.weight !== undefined && msg.weight >= 0) {
        state.weights[msg.bucket] = msg.weight;
        ns.print(`  ${C.cyan}WEIGHT${C.reset} ${msg.bucket}: ${msg.weight}`);
      }
      break;

    case "reset-weights":
      for (const bucket of Object.keys(state.weights)) {
        state.weights[bucket] = DEFAULT_WEIGHTS[bucket] ?? 10;
      }
      ns.print(`  ${C.cyan}RESET${C.reset} All weights restored to defaults`);
      break;
  }
}

function ensureBucket(bucket: string): void {
  if (state.balances[bucket] === undefined) {
    state.balances[bucket] = 0;
    state.lifetimeSpent[bucket] = 0;
    state.weights[bucket] = DEFAULT_WEIGHTS[bucket] ?? 10;
    state.activeFlags[bucket] = true;
    state.caps[bucket] = null;
  }
}

/** Check persistent done markers written by consumer daemons. */
function checkDoneMarkers(ns: NS): void {
  const content = ns.read(DONE_MARKER_FILE);
  if (!content) return;
  const doneBuckets = content.split("\n").filter(Boolean);
  for (const bucket of doneBuckets) {
    ensureBucket(bucket);
    if (state.activeFlags[bucket]) {
      ns.print(`  ${C.yellow}DONE${C.reset} ${bucket}: closing bucket (from marker)`);
      handleCompletion(bucket, state.balances, state.weights, state.activeFlags);
    }
  }
}

// === INCOME RATE TRACKING ===

function updateIncomeRate(income: number): void {
  incomeHistory.push(income);
  if (incomeHistory.length > INCOME_HISTORY_SIZE) {
    incomeHistory.shift();
  }
}

function getIncomeRate(intervalMs: number): number {
  if (incomeHistory.length === 0) return 0;
  const sum = incomeHistory.reduce((a, b) => a + b, 0);
  const avgPerTick = sum / incomeHistory.length;
  return avgPerTick / (intervalMs / 1000);
}

// === DAEMON LOOP ===

async function daemon(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  writeDefaultConfig(ns, "budget", {
    interval: "2000",
  });

  const interval = getConfigNumber(ns, "budget", "interval", 2000);

  // Load persisted state
  state = loadState(ns);
  prevCash = ns.getPlayer().money;

  ns.print(`${C.cyan}Budget daemon started${C.reset} (interval: ${interval}ms, income-splitting)`);
  ns.print(`  Loaded ${Object.keys(state.balances).length} buckets from disk`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // 1. Drain control port + check persistent done markers
    drainControlPort(ns);
    checkDoneMarkers(ns);

    // 2. Get current cash
    const currentCash = ns.getPlayer().money;

    // 3. Check aug reset (cash drops >90%)
    if (isAugReset(prevCash, currentCash)) {
      ns.print(`  ${C.yellow}AUG RESET DETECTED${C.reset} — zeroing all balances`);
      for (const bucket of Object.keys(state.balances)) {
        state.balances[bucket] = 0;
        state.lifetimeSpent[bucket] = 0;
        state.activeFlags[bucket] = true;
        state.caps[bucket] = null;
      }
      state.rushBucket = null;
      incomeHistory.length = 0;
      purchasesThisTick = 0;
      prevCash = currentCash;
      ns.write(DONE_MARKER_FILE, "", "w");
      saveState(ns);
      await ns.sleep(interval);
      continue;
    }

    // 4. Calculate income delta
    const income = calculateIncome(prevCash, currentCash, purchasesThisTick);
    updateIncomeRate(income);

    // 5. Split income across buckets
    if (income > 0) {
      const deltas = splitIncome(income, state.weights, state.activeFlags, state.rushBucket);
      for (const bucket of Object.keys(deltas)) {
        state.balances[bucket] = (state.balances[bucket] ?? 0) + deltas[bucket];
      }
    }

    // 6. Cap tracking (informational only — buckets only close via explicit signalDone)
    // Caps are still tracked for display purposes but no longer trigger auto-close.
    // Consumer daemons call signalDone() when they are truly finished.

    // If rush bucket is no longer active, cancel rush
    if (state.rushBucket && !state.activeFlags[state.rushBucket]) {
      state.rushBucket = null;
    }

    // 7. Compute effective weights for display
    const effectiveWeights = computeEffectiveWeights(state.weights, state.activeFlags, state.rushBucket);
    const totalIncomeRate = getIncomeRate(interval);

    // 8. Build & publish BudgetStatus
    const buckets: Record<string, BucketState> = {};
    for (const bucket of Object.keys(state.balances)) {
      const balance = state.balances[bucket] ?? 0;
      const lifetime = state.lifetimeSpent[bucket] ?? 0;
      const ew = effectiveWeights[bucket] ?? 0;
      const bucketIncomeRate = totalIncomeRate * ew;
      const cap = state.caps[bucket] ?? null;

      buckets[bucket] = {
        bucket,
        balance,
        balanceFormatted: ns.formatNumber(balance),
        weight: state.weights[bucket] ?? 0,
        effectiveWeight: ew,
        lifetimeSpent: lifetime,
        lifetimeSpentFormatted: ns.formatNumber(lifetime),
        incomeRate: bucketIncomeRate,
        incomeRateFormatted: ns.formatNumber(bucketIncomeRate) + "/s",
        active: state.activeFlags[bucket] ?? false,
        cap,
        capFormatted: cap !== null ? ns.formatNumber(cap) : null,
      };
    }

    const status: BudgetStatus = {
      totalCash: currentCash,
      totalCashFormatted: ns.formatNumber(currentCash),
      totalIncomeRate,
      totalIncomeRateFormatted: ns.formatNumber(totalIncomeRate) + "/s",
      buckets,
      rushBucket: state.rushBucket,
      lastUpdated: Date.now(),
    };

    publishStatus(ns, STATUS_PORTS.budget, status);

    // 9. Save balances to disk
    saveState(ns);

    // 10. Reset per-tick counters
    purchasesThisTick = 0;
    prevCash = currentCash;

    // Print summary
    const activeCount = Object.values(state.activeFlags).filter(v => v).length;
    const totalBuckets = Object.keys(state.balances).length;
    const rushLabel = state.rushBucket ? ` ${C.yellow}RUSH:${state.rushBucket}${C.reset}` : "";
    ns.print(
      `${C.cyan}=== Budget ===${C.reset} ` +
      `Cash: ${ns.formatNumber(currentCash)} | ` +
      `Income: ${ns.formatNumber(totalIncomeRate)}/s | ` +
      `Active: ${activeCount}/${totalBuckets}${rushLabel}`
    );

    for (const bucket of Object.keys(buckets)) {
      const b = buckets[bucket];
      if (!b.active) continue;
      ns.print(
        `  ${C.cyan}${bucket.padEnd(12)}${C.reset} ` +
        `bal: ${b.balanceFormatted.padStart(8)} | ` +
        `${b.incomeRateFormatted.padStart(8)} | ` +
        `spent: ${b.lifetimeSpentFormatted}`
      );
    }

    await ns.sleep(interval);
  }
}
