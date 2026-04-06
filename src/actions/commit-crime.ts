/**
 * Commit Crime Action
 *
 * One-shot script to start committing a crime.
 * Target RAM: ~82 GB at SF4.1 (commitCrime = 1 Singularity function, high cost)
 *
 * Usage: run actions/commit-crime.js --crime Homicide
 *        run actions/commit-crime.js --crime Mug
 */
import { NS, CrimeType } from "@ns";

export const MANUAL_COMMAND = 'ns.singularity.commitCrime("Homicide")';

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
 if (!ns.getResetInfo().ownedSF.has(4)) {
  ns.print("Error: SF4.1 is required to commit crimes. You do not have SF4.1 unlocked.");
  return;
 }
  const flags = ns.flags([
    ["crime", "Homicide"],
    ["focus", false],
  ]) as { crime: string; focus: boolean; _: string[] };

  const crime = flags.crime || (flags._.length > 0 ? String(flags._[0]) : "Homicide");
  const focus = flags.focus;

  const validCrimes = [
    "Shoplift", "Rob Store", "Mug", "Larceny", "Deal Drugs",
    "Bond Forgery", "Traffick Arms", "Homicide", "Grand Theft Auto",
    "Kidnap", "Assassination", "Heist",
  ];

  if (!validCrimes.includes(crime)) {
    ns.tprint(`ERROR: Invalid crime "${crime}". Valid crimes:`);
    for (const c of validCrimes) {
      ns.tprint(`  - ${c}`);
    }
    return;
  }

  ns.singularity.commitCrime(crime as CrimeType, focus);
  ns.tprint(`SUCCESS: Committing ${crime}${focus ? " (focused)" : ""}`);
}
