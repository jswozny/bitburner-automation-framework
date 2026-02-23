/**
 * Budget Consumer Helpers
 *
 * Lightweight functions for daemons that interact with the budget daemon.
 * If the budget daemon isn't running, these functions gracefully degrade
 * (consumers assume unlimited budget).
 *
 * Import with: import { getBudgetBalance, canAfford, notifyPurchase, signalDone, reportCap } from "/lib/budget";
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
  return bucketState.balance;
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
 * Report a remaining-cost cap for a bucket.
 * When lifetime spending reaches this cap, the bucket auto-closes.
 */
export function reportCap(ns: NS, bucket: string, remainingCost: number): void {
  const port = ns.getPortHandle(BUDGET_CONTROL_PORT);
  const msg: BudgetControlMessage = {
    action: "report-cap",
    bucket,
    cap: remainingCost,
  };
  port.write(JSON.stringify(msg));
}
