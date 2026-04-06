/**
 * Go Public Action
 *
 * One-shot: take corporation public.
 *
 * Usage: run actions/corp/go-public.js --shares 0
 */
import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["shares", 0],
  ]) as { shares: number; _: string[] };

  try {
    const success = ns.corporation.goPublic(flags.shares);
    if (success) {
      ns.tprint(`SUCCESS: Corporation is now public (issued ${flags.shares} shares)`);
    } else {
      ns.tprint("FAILED: Could not go public");
    }
  } catch (e) {
    ns.tprint(`ERROR: ${e}`);
  }
}
