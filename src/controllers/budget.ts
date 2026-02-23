/**
 * Budget Controller (Pure Logic)
 *
 * Income-splitting algorithm: tracks income deltas, splits incoming money
 * across weighted buckets, each with a running balance consumers spend from.
 *
 * Zero NS imports — safe to import without RAM cost.
 *
 * Import with: import { splitIncome, ... } from "/controllers/budget";
 */

// === DEFAULT WEIGHTS ===

export const DEFAULT_WEIGHTS: Record<string, number> = {
  stocks: 50,
  servers: 25,
  gang: 15,
  home: 10,
  hacknet: 10,
  programs: 5,
  "wse-access": 5,
};

// === PERSISTED STATE ===

export interface PersistedBudgetState {
  balances: Record<string, number>;
  lifetimeSpent: Record<string, number>;
  weights: Record<string, number>;
  activeFlags: Record<string, boolean>;
  caps: Record<string, number | null>;
  rushBucket: string | null;
}

export function createDefaultPersistedState(): PersistedBudgetState {
  const balances: Record<string, number> = {};
  const lifetimeSpent: Record<string, number> = {};
  const activeFlags: Record<string, boolean> = {};
  const caps: Record<string, number | null> = {};

  for (const bucket of Object.keys(DEFAULT_WEIGHTS)) {
    balances[bucket] = 0;
    lifetimeSpent[bucket] = 0;
    activeFlags[bucket] = true;
    caps[bucket] = null;
  }

  return {
    balances,
    lifetimeSpent,
    weights: { ...DEFAULT_WEIGHTS },
    activeFlags,
    caps,
    rushBucket: null,
  };
}

// === INCOME CALCULATION ===

/**
 * Calculate income delta for this tick.
 * income = (currentCash - prevCash) + purchasesThisTick
 * Purchases add back what was spent so we see gross income, not net.
 */
export function calculateIncome(
  prevCash: number,
  currentCash: number,
  purchasesThisTick: number,
): number {
  const delta = currentCash - prevCash + purchasesThisTick;
  // Only distribute positive income (don't claw back on spending)
  return Math.max(0, delta);
}

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
 * Rush mode: 100% to rushed bucket, 0% to everything else.
 * Normal mode: distribute among active buckets by weight.
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

  let totalWeight = 0;
  for (const bucket of Object.keys(weights)) {
    if (activeFlags[bucket]) {
      totalWeight += weights[bucket];
    }
  }

  for (const bucket of Object.keys(weights)) {
    if (activeFlags[bucket] && totalWeight > 0) {
      effective[bucket] = weights[bucket] / totalWeight;
    } else {
      effective[bucket] = 0;
    }
  }

  return effective;
}

// === INCOME SPLITTING ===

/**
 * Split income across buckets by effective weight.
 * Returns per-bucket deltas to add to balances.
 */
export function splitIncome(
  income: number,
  weights: Record<string, number>,
  activeFlags: Record<string, boolean>,
  rushBucket: string | null,
): Record<string, number> {
  const effective = computeEffectiveWeights(weights, activeFlags, rushBucket);
  const deltas: Record<string, number> = {};

  for (const bucket of Object.keys(weights)) {
    deltas[bucket] = income * (effective[bucket] ?? 0);
  }

  return deltas;
}

// === COMPLETION HANDLING ===

/**
 * Handle a bucket signaling "done". Deactivates the bucket and redistributes
 * its remaining balance proportionally to other active buckets.
 */
export function handleCompletion(
  bucket: string,
  balances: Record<string, number>,
  weights: Record<string, number>,
  activeFlags: Record<string, boolean>,
): void {
  activeFlags[bucket] = false;
  const surplus = balances[bucket];
  balances[bucket] = 0;

  if (surplus <= 0) return;

  // Find other active buckets and redistribute proportionally
  let totalActiveWeight = 0;
  for (const b of Object.keys(weights)) {
    if (b !== bucket && activeFlags[b]) {
      totalActiveWeight += weights[b];
    }
  }

  if (totalActiveWeight <= 0) return;

  for (const b of Object.keys(weights)) {
    if (b !== bucket && activeFlags[b]) {
      balances[b] += surplus * (weights[b] / totalActiveWeight);
    }
  }
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
