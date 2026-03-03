/**
 * Set Dividends Action
 *
 * One-shot: set dividend rate.
 *
 * Usage: run actions/corp/set-dividends.js --rate 0.1
 */
import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["rate", 0.1],
  ]) as { rate: number; _: string[] };

  if (flags.rate < 0 || flags.rate > 1) {
    ns.tprint("ERROR: Rate must be between 0 and 1. Usage: run actions/corp/set-dividends.js --rate 0.1");
    return;
  }

  try {
    ns.corporation.issueDividends(flags.rate);
    ns.tprint(`SUCCESS: Dividend rate set to ${(flags.rate * 100).toFixed(1)}%`);
  } catch (e) {
    ns.tprint(`ERROR: ${e}`);
  }
}
