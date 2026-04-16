/**
 * Budget Controller (Pure Logic)
 *
 * Snapshot-based "allowance" model: each tick computes fresh spending limits
 * from current wealth. No accumulated state to drift out of sync.
 *
 * Two consumer classes:
 *   Holders (stocks, corp) — allowance = max(0, netWorth * weight% - currentHolding)
 *   Spenders (everything else) — allowance = cash * weight%
 *
 * Zero NS imports — safe to import without RAM cost.
 *
 * Import with: import { computeAllowances, ... } from "/controllers/budget";
 */

// === HOLDER BUCKETS ===

export const HOLDER_BUCKETS = new Set(["stocks", "corp"]);

// === DEFAULT WEIGHTS ===

export const DEFAULT_WEIGHTS: Record<string, number> = {
  stocks: 30,
  servers: 25,
  corp: 22,
  home: 15,
  gang: 10,
  hacknet: 5,
  programs: 5,
  "wse-access": 5,
};

// === PERSISTED STATE ===

export interface PersistedBudgetState {
  lifetimeSpent: Record<string, number>;
  weights: Record<string, number>;
  activeFlags: Record<string, boolean>;
  caps: Record<string, number | null>;
  rushBucket: string | null;
  frozenWeights: Record<string, number>;
  lastCash?: number;
}

export function createDefaultPersistedState(): PersistedBudgetState {
  const lifetimeSpent: Record<string, number> = {};
  const activeFlags: Record<string, boolean> = {};
  const caps: Record<string, number | null> = {};

  for (const bucket of Object.keys(DEFAULT_WEIGHTS)) {
    lifetimeSpent[bucket] = 0;
    activeFlags[bucket] = true;
    caps[bucket] = null;
  }

  return {
    lifetimeSpent,
    weights: { ...DEFAULT_WEIGHTS },
    activeFlags,
    caps,
    rushBucket: null,
    frozenWeights: {},
  };
}

// === AUGMENTATION RESET DETECTION ===

/**
 * Detect augmentation reset: cash drops >90% between ticks.
 */
export function isAugReset(prevCash: number, currentCash: number): boolean {
  if (prevCash <= 0) return false;
  return currentCash < prevCash * 0.1;
}

// === EFFECTIVE WEIGHTS ===

/**
 * Compute effective weights considering active flags and rush mode.
 * Rush mode: rushed bucket gets weight 1, others get 0.
 * Normal mode: each bucket's weight / 100 (weights are independent caps, not shares).
 */
export function computeEffectiveWeights(
  weights: Record<string, number>,
  activeFlags: Record<string, boolean>,
  rushBucket: string | null,
): Record<string, number> {
  const effective: Record<string, number> = {};

  if (rushBucket && activeFlags[rushBucket]) {
    for (const bucket of Object.keys(weights)) {
      effective[bucket] = bucket === rushBucket ? 1 : 0;
    }
    return effective;
  }

  for (const bucket of Object.keys(weights)) {
    if (activeFlags[bucket]) {
      effective[bucket] = weights[bucket] / 100;
    } else {
      effective[bucket] = 0;
    }
  }

  return effective;
}

// === ALLOWANCE COMPUTATION ===

export interface AllowanceResult {
  allowance: number;
  maxAllocation: number;
  currentHolding: number;
  isHolder: boolean;
}

export interface HoldingsInfo {
  portfolioValue: number;
  corpFunds: number;
}

/**
 * Compute allowances for all buckets based on current wealth snapshot.
 *
 * Holders: allowance = max(0, netWorth * weight% - currentHoldingValue)
 * Spenders: allowance = cash * weight%
 */
export function computeAllowances(
  cash: number,
  holdings: HoldingsInfo,
  weights: Record<string, number>,
  activeFlags: Record<string, boolean>,
  rushBucket: string | null,
): Record<string, AllowanceResult> {
  const netWorth = cash + holdings.portfolioValue + holdings.corpFunds;
  const effectiveWeights = computeEffectiveWeights(weights, activeFlags, rushBucket);
  const results: Record<string, AllowanceResult> = {};

  for (const bucket of Object.keys(weights)) {
    const ew = effectiveWeights[bucket] ?? 0;
    const isHolder = HOLDER_BUCKETS.has(bucket);

    let currentHolding = 0;
    if (bucket === "stocks") currentHolding = holdings.portfolioValue;
    else if (bucket === "corp") currentHolding = holdings.corpFunds;

    let maxAllocation: number;
    let allowance: number;

    if (isHolder) {
      // Holders: percentage of net worth, minus what they already hold
      maxAllocation = netWorth * ew;
      allowance = Math.max(0, maxAllocation - currentHolding);
    } else {
      // Spenders: percentage of cash
      maxAllocation = cash * ew;
      allowance = maxAllocation;
    }

    results[bucket] = { allowance, maxAllocation, currentHolding, isHolder };
  }

  return results;
}

// === COMPLETION HANDLING ===

/**
 * Handle a bucket signaling "done". Simply deactivates the bucket.
 * No balance redistribution needed — other allowances naturally increase
 * since the done bucket's weight is zeroed via activeFlags.
 */
export function handleCompletion(
  bucket: string,
  activeFlags: Record<string, boolean>,
): void {
  activeFlags[bucket] = false;
}

// === CAP CHECKING ===

/**
 * Check if a bucket has reached its reported cost cap.
 */
export function isBucketCapReached(
  lifetimeSpent: number,
  cap: number | null,
): boolean {
  if (cap === null) return false;
  return lifetimeSpent >= cap;
}
