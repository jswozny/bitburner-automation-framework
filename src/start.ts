/**
 * Bootstrap Script
 *
 * Minimal entry point that launches the dashboard, core daemons, and queue runner.
 * Uses ensureRamAndExec so it works even when home RAM is full of workers.
 *
 * Usage: run start.js
 * Also used as the post-augmentation-install entry point.
 *
 * RAM: ~3.8 GB (launcher lib + base)
 */
import { NS } from "@ns";
import { ensureRamAndExec } from "/lib/launcher";

/** Check if any instance of a script is running, regardless of arguments. */
function isScriptRunning(ns: NS, path: string, host: string): boolean {
  return ns.ps(host).some(p => p.filename === path);
}

/** Core daemons to launch after the dashboard, in priority order. */
const CORE_SCRIPTS: { path: string; args: (string | number | boolean)[] }[] = [
  { path: "daemons/nuke.js", args: [] },
  { path: "daemons/hack.js", args: [] },
  { path: "daemons/queue.js", args: [] },
  { path: "daemons/darkweb.js", args: [] },
];

/** Optional daemons launched if RAM permits. */
const OPTIONAL_SCRIPTS: { path: string; args: (string | number | boolean)[] }[] = [
  { path: "daemons/pserv.js", args: [] },
  { path: "daemons/share.js", args: [] },
  { path: "daemons/faction.js", args: [] },
  { path: "daemons/gang.js", args: [] },
];

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  // 1. Launch dashboard
  const dashPath = "views/dashboard/dashboard.js";
  if (isScriptRunning(ns, dashPath, "home")) {
    ns.tprint(`INFO: ${dashPath} already running`);
  } else {
    const dashPid = ensureRamAndExec(ns, dashPath, "home");
    if (dashPid > 0) {
      ns.tprint("SUCCESS: Dashboard launched (pid " + dashPid + ")");
    } else {
      ns.tprint("WARN: Could not launch dashboard");
    }
  }

  // Brief pause to let dashboard initialize
  await ns.sleep(500);

  // 2. Launch core daemons
  for (const { path, args } of CORE_SCRIPTS) {
    if (isScriptRunning(ns, path, "home")) {
      ns.tprint(`INFO: ${path} already running`);
      continue;
    }
    const pid = ensureRamAndExec(ns, path, "home", 1, ...args);
    if (pid > 0) {
      ns.tprint(`SUCCESS: ${path} launched (pid ${pid})`);
    } else {
      ns.tprint(`WARN: Skipping ${path} — could not free enough RAM`);
    }
  }

  // 3. Launch optional daemons if RAM available
  for (const { path, args } of OPTIONAL_SCRIPTS) {
    if (isScriptRunning(ns, path, "home")) {
      ns.tprint(`INFO: ${path} already running`);
      continue;
    }
    const available = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    const needed = ns.getScriptRam(path);
    if (available >= needed) {
      const pid = ns.exec(path, "home", 1, ...args);
      if (pid > 0) {
        ns.tprint(`SUCCESS: ${path} launched (pid ${pid})`);
      }
    } else {
      ns.tprint(`INFO: Skipping optional ${path} — not enough free RAM`);
    }
  }

  ns.tprint("INFO: Bootstrap complete");
}
