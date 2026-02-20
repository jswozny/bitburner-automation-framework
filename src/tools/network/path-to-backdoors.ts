import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const BACKDOOR = [
    "CSEC",
    "avmnite-02h",
    "I.I.I.I",
    "run4theh111z",
  ];

  for (const host of BACKDOOR) {
    ns.run("/tools/network/path-to.js", 1, host);
  }
}
