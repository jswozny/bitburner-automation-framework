/**
 * Budget Controller (Pure Logic)
 *
 * ROI estimation, allocation algorithm, tier sorting.
 * Zero NS imports — safe to import without RAM cost.
 *
 * Import with: import { computeAllocations, ... } from "/controllers/budget";
 */

import { BucketAllocation, BudgetStatus } from "/types/ports";

// === BUCKET TIER DEFINITIONS ===

/** Tier assignments for known buckets. */
const BUCKET_TIERS: Record<string, 1 | 2 | 3> = {
  programs: 1,       // TOR, BruteSSH, etc.
  "wse-access": 1,   // WSE + TIX API access
  stocks: 2,
  servers: 2,
  hacknet: 2,
  donations: 3,
};

/** Get the tier for a bucket, defaulting to 2. */
export function getBucketTier(bucket: string): 1 | 2 | 3 {
  return BUCKET_TIERS[bucket] ?? 2;
}

// === SPEND REQUEST ===

export interface SpendRequest {
  bucket: string;
  amount: number;
  estimatedROI?: number;
  reason: string;
  timestamp: number;
}

export interface PurchaseNotification {
  bucket: string;
  amount: number;
  reason: string;
  timestamp: number;
}

// === ALLOCATION LOGIC ===

/** Emergency reserve: keep at least this fraction of cash unallocated. */
const RESERVE_FRACTION = 0.01;
const MIN_RESERVE = 100_000; // $100k

export function computeReserve(totalCash: number): number {
  return Math.max(MIN_RESERVE, totalCash * RESERVE_FRACTION);
}

/**
 * Compute per-bucket allocations from pending requests.
 *
 * Algorithm:
 * 1. Subtract reserve from available cash
 * 2. Fund Tier 1 first (sorted by ROI descending)
 * 3. Remaining goes to Tier 2 (proportional to ROI)
 * 4. Any leftover goes to Tier 3
 */
export function computeAllocations(
  totalCash: number,
  requests: SpendRequest[],
): BudgetStatus {
  const reserve = computeReserve(totalCash);
  let available = Math.max(0, totalCash - reserve);

  // Group requests by bucket
  const bucketRequests = new Map<string, SpendRequest[]>();
  for (const req of requests) {
    const list = bucketRequests.get(req.bucket) || [];
    list.push(req);
    bucketRequests.set(req.bucket, list);
  }

  // Compute per-bucket demand and best ROI
  const bucketDemand = new Map<string, { total: number; bestROI: number; count: number }>();
  for (const [bucket, reqs] of bucketRequests) {
    let total = 0;
    let bestROI = 0;
    for (const r of reqs) {
      total += r.amount;
      if (r.estimatedROI !== undefined && r.estimatedROI > bestROI) {
        bestROI = r.estimatedROI;
      }
    }
    bucketDemand.set(bucket, { total, bestROI, count: reqs.length });
  }

  const allocations: Record<string, BucketAllocation> = {};

  // Initialize all known buckets
  const allBuckets = new Set([...bucketDemand.keys()]);
  for (const bucket of allBuckets) {
    const tier = getBucketTier(bucket);
    const demand = bucketDemand.get(bucket);
    allocations[bucket] = {
      bucket,
      tier,
      allocated: 0,
      estimatedROI: demand?.bestROI ?? 0,
      pendingRequests: demand?.count ?? 0,
    };
  }

  // Phase 1: Fund Tier 1
  const tier1 = [...allBuckets]
    .filter(b => getBucketTier(b) === 1)
    .sort((a, b) => (bucketDemand.get(b)?.bestROI ?? 0) - (bucketDemand.get(a)?.bestROI ?? 0));

  for (const bucket of tier1) {
    const demand = bucketDemand.get(bucket);
    if (!demand) continue;
    const grant = Math.min(demand.total, available);
    allocations[bucket].allocated = grant;
    available -= grant;
  }

  // Phase 2: Fund Tier 2 by ROI proportion
  const tier2 = [...allBuckets].filter(b => getBucketTier(b) === 2);
  const tier2Demands = tier2.map(b => ({ bucket: b, demand: bucketDemand.get(b)! })).filter(d => d.demand);
  const totalROI = tier2Demands.reduce((sum, d) => sum + Math.max(d.demand.bestROI, 0.01), 0);

  if (totalROI > 0 && available > 0) {
    for (const { bucket, demand } of tier2Demands) {
      const share = Math.max(demand.bestROI, 0.01) / totalROI;
      const grant = Math.min(demand.total, available * share);
      allocations[bucket].allocated = grant;
      available -= grant;
    }
  }

  // Phase 3: Fund Tier 3 with leftovers
  const tier3 = [...allBuckets]
    .filter(b => getBucketTier(b) === 3)
    .sort((a, b) => (bucketDemand.get(b)?.bestROI ?? 0) - (bucketDemand.get(a)?.bestROI ?? 0));

  for (const bucket of tier3) {
    const demand = bucketDemand.get(bucket);
    if (!demand) continue;
    const grant = Math.min(demand.total, available);
    allocations[bucket].allocated = grant;
    available -= grant;
  }

  // Compute tier breakdown
  const tierBreakdown = { tier1: 0, tier2: 0, tier3: 0 };
  for (const alloc of Object.values(allocations)) {
    if (alloc.tier === 1) tierBreakdown.tier1 += alloc.allocated;
    else if (alloc.tier === 2) tierBreakdown.tier2 += alloc.allocated;
    else tierBreakdown.tier3 += alloc.allocated;
  }

  return {
    totalCash,
    totalCashFormatted: "",  // Filled by daemon (needs ns.formatNumber)
    reserve,
    reserveFormatted: "",
    allocations,
    tierBreakdown,
    lastUpdated: Date.now(),
  };
}

// === FALLBACK ROI HEURISTICS ===

/**
 * Estimate ROI for a program purchase (unlocks hacking capabilities).
 * Programs have very high ROI early game.
 */
export function estimateProgramROI(programName: string, currentTools: number): number {
  // Each new port opener dramatically increases hack target pool
  const portOpeners = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
  if (portOpeners.includes(programName)) {
    // Higher ROI when you have fewer tools (each new tool opens more servers)
    return 100 - currentTools * 15;
  }
  // DeepscanV1/V2, AutoLink, ServerProfiler — nice but not income-generating
  return 5;
}

/**
 * Estimate ROI for a server upgrade (more RAM = more hack threads).
 */
export function estimateServerROI(currentRam: number, nextRam: number, incomePerSec: number): number {
  if (currentRam <= 0 || incomePerSec <= 0) return 1;
  // Rough: doubling RAM roughly doubles hack capacity
  const multiplier = nextRam / currentRam;
  return multiplier * 10;
}

/**
 * Estimate ROI for stock investment based on historical return rate.
 */
export function estimateStockROI(portfolioValue: number, profitPerSec: number): number {
  if (portfolioValue <= 0) return 0.5;
  // Annualized return rate, scaled down
  return Math.max(0.1, (profitPerSec / portfolioValue) * 100);
}
