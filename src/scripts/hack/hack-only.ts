/**
 * Hack-only loop
 *
 * Simple script that just hacks a target in a loop.
 * Useful as a worker script or for testing.
 *
 * Run: run hack/hack-only.js n00dles
 *      run hack/hack-only.js n00dles --one-shot
 */
import { NS } from "@ns";

// === CORE LOGIC ===

/**
 * Run one hack on a target
 */
export async function runHackCycle(ns: NS, target: string): Promise<number> {
  return await ns.hack(target);
}

// === RUNNER ===

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([["one-shot", false]]) as {
    "one-shot": boolean;
    _: string[];
  };

  const target = flags._[0] as string;

  if (!target) {
    ns.tprint("ERROR: No target specified. Usage: run hack/hack-only.js <target>");
    return;
  }

  do {
    await runHackCycle(ns, target);
  } while (!flags["one-shot"]);
}
