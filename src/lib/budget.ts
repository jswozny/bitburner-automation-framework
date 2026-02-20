/**
 * Budget Consumer Helpers
 *
 * Lightweight functions for daemons that want to interact with the
 * budget daemon. If the budget daemon isn't running, these functions
 * gracefully degrade (consumers assume unlimited budget).
 *
 * Import with: import { requestBudget, notifyPurchase, getBudgetAllocation } from "/lib/budget";
 */
import { NS } from "@ns";
import { peekStatus } from "/lib/ports";
import { STATUS_PORTS, BUDGET_CONTROL_PORT, BudgetStatus, BucketAllocation } from "/types/ports";

/**
 * Send a spend request to the budget daemon.
 * Call this BEFORE making a purchase to register intent.
 */
export function requestBudget(
  ns: NS,
  bucket: string,
  amount: number,
  reason: string,
  estimatedROI?: number,
): void {
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  port.write(JSON.stringify({
    action: "request",
    bucket,
    amount,
    estimatedROI,
    reason,
  }));
}

/**
 * Notify the budget daemon that a purchase was completed.
 * Call this AFTER a successful purchase.
 */
export function notifyPurchase(
  ns: NS,
  bucket: string,
  amount: number,
  reason: string,
): void {
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  port.write(JSON.stringify({
    action: "purchased",
    bucket,
    amount,
    reason,
  }));
}

/**
 * Get the current budget allocation for a specific bucket.
 * Returns null if the budget daemon isn't running (caller should
 * treat this as "unlimited budget" per the graceful fallback design).
 */
export function getBudgetAllocation(ns: NS, bucket: string): BucketAllocation | null {
  const status = peekStatus<BudgetStatus>(ns, STATUS_PORTS.budget, 30_000);
  if (!status) return null;
  return status.allocations[bucket] ?? null;
}

/**
 * Check if spending a given amount is within the budget for a bucket.
 * Returns true if:
 *   - Budget daemon is not running (unlimited fallback)
 *   - The bucket has enough allocation
 */
export function canSpend(ns: NS, bucket: string, amount: number): boolean {
  const alloc = getBudgetAllocation(ns, bucket);
  if (alloc === null) return true; // No budget daemon → unlimited
  return alloc.allocated >= amount;
}
