/**
 * Buy TOR Router Action
 *
 * One-shot script to purchase the TOR router from the darkweb.
 * Target RAM: ~34 GB at SF4.1 (purchaseTor = 1 Singularity function)
 *
 * Usage: run actions/buy-tor.js
 */
import { NS } from "@ns";

export const MANUAL_COMMAND = 'ns.singularity.purchaseTor()';

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const success = ns.singularity.purchaseTor();

  if (success) {
    ns.tprint("SUCCESS: Purchased TOR router");
  } else {
    ns.tprint("FAILED: Could not purchase TOR router (cost: $200k)");
  }
}
