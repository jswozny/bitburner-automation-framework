/**
 * Budget Consumer Helpers
 *
 * Lightweight functions for daemons that interact with the budget daemon.
 * If the budget daemon isn't running, these functions gracefully degrade
 * (consumers assume unlimited budget).
 *
 * Import with: import { getBudgetBalance, canAfford, notifyPurchase, signalDone, reportCap, setBudgetWeight } from "/lib/budget";
 */
import { NS } from "@ns";
import { peekStatus } from "/lib/ports";
import {
  STATUS_PORTS,
  BUDGET_CONTROL_PORT,
  BudgetStatus,
  BudgetControlMessage,
} from "/types/ports";

/**
 * Get the current balance for a bucket.
 * Returns Infinity if the budget daemon isn't running (unlimited fallback).
 */
export function getBudgetBalance(ns: NS, bucket: string): number {
  const status = peekStatus<BudgetStatus>(ns, STATUS_PORTS.budget, 30_000);
  if (!status) return Infinity;
  const bucketState = status.buckets[bucket];
  if (!bucketState) return Infinity;
  return bucketState.allowance;
}

/**
 * Check if a bucket can afford a given amount.
 * Returns true if budget daemon isn't running (unlimited fallback).
 */
export function canAfford(ns: NS, bucket: string, amount: number): boolean {
  const balance = getBudgetBalance(ns, bucket);
  return balance >= amount;
}

/**
 * Notify the budget daemon that a purchase was completed.
 * Call this AFTER a successful purchase so the daemon can
 * deduct from the bucket's balance and track lifetime spending.
 */
export function notifyPurchase(
  ns: NS,
  bucket: string,
  amount: number,
  reason: string,
): void {
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  const msg: BudgetControlMessage = {
    action: "purchased",
    bucket,
    amount,
    reason,
  };
  port.write(JSON.stringify(msg));
}

/**
 * Signal that a bucket is "done" — no more spending needed.
 * The bucket's weight and remaining balance will be redistributed.
 *
 * Writes a persistent marker file so the signal survives across
 * budget daemon restarts and startup ordering issues.
 */
export function signalDone(ns: NS, bucket: string): void {
  // Write persistent marker (survives budget daemon restart)
  const markerFile = "/data/budget-done.txt";
  const existing = ns.read(markerFile);
  const doneBuckets = existing ? existing.split("\n").filter(Boolean) : [];
  if (!doneBuckets.includes(bucket)) {
    doneBuckets.push(bucket);
    ns.write(markerFile, doneBuckets.join("\n"), "w");
  }

  // Also send port message for immediate processing
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  const msg: BudgetControlMessage = {
    action: "done",
    bucket,
  };
  port.write(JSON.stringify(msg));
}

/**
 * Reactivate a bucket that was previously marked as done.
 * Removes the persistent marker and sends a reactivate message
 * so the budget daemon re-enables the bucket.
 */
export function reactivateBucket(ns: NS, bucket: string): void {
  const markerFile = "/data/budget-done.txt";
  const existing = ns.read(markerFile);
  if (existing) {
    const filtered = existing.split("\n").filter(Boolean).filter(b => b !== bucket);
    ns.write(markerFile, filtered.join("\n"), "w");
  }
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  const msg: BudgetControlMessage = { action: "reactivate", bucket };
  port.write(JSON.stringify(msg));
}

/**
 * Set a bucket's weight. Use 0 to release the allowance (e.g. when pausing).
 */
export function setBudgetWeight(ns: NS, bucket: string, weight: number): void {
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  const msg: BudgetControlMessage = {
    action: "update-weight",
    bucket,
    weight,
  };
  port.write(JSON.stringify(msg));
}

export function reportCap(ns: NS, bucket: string, remainingCost: number): void {
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  const msg: BudgetControlMessage = {
    action: "report-cap",
    bucket,
    cap: remainingCost,
  };
  port.write(JSON.stringify(msg));
}
