/**
 * Budget Daemon
 *
 * Centralized spending coordinator. Reads spend requests and purchase
 * notifications from the control port, computes per-bucket allocations
 * using tiered ROI logic, and publishes BudgetStatus to the status port.
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
} from "/types/ports";
import {
  SpendRequest,
  PurchaseNotification,
  computeAllocations,
} from "/controllers/budget";

const C = COLORS;

/** @ram 4 */
export function main(ns: NS): Promise<void> {
  ns.ramOverride(4);
  return daemon(ns);
}

// === STATE ===

/** Active spend requests (keyed by bucket:reason for dedup). */
const pendingRequests: Map<string, SpendRequest> = new Map();

/** TTL for requests — stale requests get purged. */
const REQUEST_TTL_MS = 60_000;

// === CONTROL PORT ===

interface ControlMessage {
  action: "request" | "purchased";
  bucket: string;
  amount: number;
  estimatedROI?: number;
  reason: string;
}

function readControlPort(ns: NS): void {
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  while (!port.empty()) {
    const data = port.read();
    if (data === "NULL PORT DATA") break;
    try {
      const msg = JSON.parse(data as string) as ControlMessage;
      handleMessage(ns, msg);
    } catch {
      // Invalid message, skip
    }
  }
}

function handleMessage(ns: NS, msg: ControlMessage): void {
  if (msg.action === "request") {
    const key = `${msg.bucket}:${msg.reason}`;
    pendingRequests.set(key, {
      bucket: msg.bucket,
      amount: msg.amount,
      estimatedROI: msg.estimatedROI,
      reason: msg.reason,
      timestamp: Date.now(),
    });
    ns.print(`  ${C.cyan}REQ${C.reset} ${msg.bucket}: ${ns.formatNumber(msg.amount)} (${msg.reason})`);
  } else if (msg.action === "purchased") {
    // Remove matching requests for this bucket
    const toRemove: string[] = [];
    for (const [key, req] of pendingRequests) {
      if (req.bucket === msg.bucket && req.reason === msg.reason) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      pendingRequests.delete(key);
    }
    ns.print(`  ${C.green}BUY${C.reset} ${msg.bucket}: ${ns.formatNumber(msg.amount)} (${msg.reason})`);
  }
}

// === PURGE STALE ===

function purgeStaleRequests(): void {
  const now = Date.now();
  for (const [key, req] of pendingRequests) {
    if (now - req.timestamp > REQUEST_TTL_MS) {
      pendingRequests.delete(key);
    }
  }
}

// === DAEMON LOOP ===

async function daemon(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  writeDefaultConfig(ns, "budget", {
    interval: "2000",
    reserveFraction: "0.01",
    "weight.stocks": "50",
    "weight.servers": "25",
    "weight.gang": "15",
    "weight.hacknet": "10",
  });

  const interval = getConfigNumber(ns, "budget", "interval", 2000);

  ns.print(`${C.cyan}Budget daemon started${C.reset} (interval: ${interval}ms)`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    readControlPort(ns);
    purgeStaleRequests();

    const totalCash = ns.getPlayer().money;
    const requests = [...pendingRequests.values()];

    const weights: Record<string, number> = {
      stocks: getConfigNumber(ns, "budget", "weight.stocks", 50),
      servers: getConfigNumber(ns, "budget", "weight.servers", 25),
      gang: getConfigNumber(ns, "budget", "weight.gang", 15),
      hacknet: getConfigNumber(ns, "budget", "weight.hacknet", 10),
    };

    const status: BudgetStatus = computeAllocations(totalCash, requests, weights);
    status.totalCashFormatted = ns.formatNumber(totalCash);
    status.reserveFormatted = ns.formatNumber(status.reserve);

    publishStatus(ns, STATUS_PORTS.budget, status);

    const allocCount = Object.keys(status.allocations).length;
    const t = status.tierBreakdown;
    ns.print(
      `${C.cyan}=== Budget ===${C.reset} ` +
      `Cash: ${status.totalCashFormatted} | ` +
      `Buckets: ${allocCount} | ` +
      `T1: ${ns.formatNumber(t.tier1)} T2: ${ns.formatNumber(t.tier2)} T3: ${ns.formatNumber(t.tier3)}`
    );

    await ns.sleep(interval);
  }
}
