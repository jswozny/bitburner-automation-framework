/**
 * Create Corporation Action
 *
 * One-shot: create corporation, optionally self-funded.
 *
 * Usage: run actions/corp/create-corp.js --name "NovaCorp" --self-fund
 */
import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["name", "NovaCorp"],
    ["self-fund", false],
  ]) as { name: string; "self-fund": boolean; _: string[] };

  const name = flags.name;
  const selfFund = flags["self-fund"];

  if (!name) {
    ns.tprint("ERROR: No corporation name specified. Usage: run actions/corp/create-corp.js --name NovaCorp --self-fund");
    return;
  }

  try {
    const success = ns.corporation.createCorporation(name, selfFund);
    if (success) {
      ns.tprint(`SUCCESS: Corporation "${name}" created (${selfFund ? "self-funded" : "free"})`);
    } else {
      ns.tprint(`FAILED: Could not create corporation "${name}"`);
    }
  } catch (e) {
    ns.tprint(`ERROR: ${e}`);
  }
}
