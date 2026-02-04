/**
 * Bootstrap Script
 *
 * Minimal entry point that launches the dashboard and core auto-* scripts.
 * Uses ensureRamAndExec so it works even when home RAM is full of workers.
 *
 * Usage: run start.js
 * Also used as the post-augmentation-install entry point.
 *
 * RAM: ~3.8 GB (launcher lib + base)
 */
import { NS } from "@ns";
import { ensureRamAndExec } from "/lib/launcher";

/** Scripts to launch after the dashboard, in order. */
const AUTO_SCRIPTS: { path: string; args: (string | number | boolean)[] }[] = [
  { path: "auto/auto-nuke.js", args: [] },
  { path: "hack/distributed.js", args: [] },
  { path: "auto/auto-buy-programs.js", args: [] },
  { path: "auto/auto-work.js", args: ["--focus", "hacking"] },
];

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  // 1. Launch dashboard
  const dashPid = ensureRamAndExec(ns, "dashboard/dashboard.js", "home");
  if (dashPid > 0) {
    ns.tprint("SUCCESS: Dashboard launched (pid " + dashPid + ")");
  } else {
    ns.tprint("WARN: Could not launch dashboard");
  }

  // Brief pause to let dashboard initialize
  await ns.sleep(500);

  // 2. Launch auto-scripts in order
  for (const { path, args } of AUTO_SCRIPTS) {
    const pid = ensureRamAndExec(ns, path, "home", 1, ...args);
    if (pid > 0) {
      ns.tprint(`SUCCESS: ${path} launched (pid ${pid})`);
    } else {
      ns.tprint(`WARN: Skipping ${path} — could not free enough RAM`);
    }
  }

  ns.tprint("INFO: Bootstrap complete");
}
