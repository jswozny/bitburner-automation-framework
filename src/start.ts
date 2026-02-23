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
import { ensureRamAndExec } from "lib/launcher";
import { setConfigValue } from "lib/config";
import { resetBudgetWeights } from './views/dashboard/state-store';
import { getNextUpgradeInfo } from './controllers/pserv';

/** Check if any instance of a script is running, regardless of arguments. */
function isScriptRunning(ns: NS, path: string, host: string): boolean {
  return ns.ps(host).some(p => p.filename === path);
}

/*
 * Checks if all the requisite Source Files
 * listed in the SFArray parameter are available
 * 
 * @param {NS} ns 
 * @param {Array<number>} SFArray 
 * @returns {boolean} 
 */
function hasNeededSourceFiles(ns: NS, SFArray: Array<number>): boolean {
  for (const SF of SFArray) {
    if (!ns.Resetinfo().sourceFiles.some(s => s.n === SF)) {
      return false;
    }
  }
  return true;
}

/** Core daemons to launch after the dashboard, in priority order. */
const CORE_SCRIPTS: { path: string; args: (string | number | boolean)[];neededSF?: number[] }[] = [
  { path: "daemons/nuke.js", args: [], neededSF: [] },
  { path: "daemons/hack.js", args: [], neededSF: [] },
  { path: "daemons/queue.js", args: [], neededSF: [] },
  { path: "daemons/darkweb.js", args: [],neededSF: [4] },
  { path: "daemons/work.js", args: [],neededSF: [4] },
  { path: "daemons/rep.js", args: [],neededSF: [4] },
  { path: "daemons/share.js", args: [],neededSF: [] },
];

/** Optional daemons launched if RAM permits. */
const OPTIONAL_SCRIPTS: { path: string; args: (string | number | boolean)[] }[] = [
  { path: "daemons/pserv.js", args: [],neededSF: [] },
  { path: "daemons/faction.js", args: [], neededSF: [4] },
  { path: "daemons/augments.js", args: [],neededSF: [4] },
  { path: "daemons/advisor.js", args: [], neededSF: [] },
  { path: "daemons/contracts.js", args: [], neededSF: [] },
  { path: "daemons/budget.js", args: [], neededSF: [] },
  { path: "daemons/stocks.js", args: [], neededSF: [] },
  { path: "daemons/gang.js", args: [], neededSF: [4] },
  { path: "daemons/home.js", args: [], neededSF: [4] },
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

  // Set default strategies for fresh bootstrap
  setConfigValue(ns, "hack", "strategy", "money");
  setConfigValue(ns, "pserv", "autoBuy", "true");

  // 2. Launch core daemons
  for (const { path, args, neededSF } of CORE_SCRIPTS) {
    if (isScriptRunning(ns, path, "home")) {
      ns.tprint(`INFO: ${path} already running`);
      continue;
    }
    if(hasNeededSourceFiles(ns,neededSF || [])){
      ns.tprint(`INFO: All SF requirements met for ${path}`);
    } else {
      ns.tprint(`INFO: Skipping ${path} — missing required Source Files: ${neededSF?.join(", ")}`);
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
  for (const { path, args, neededSF } of OPTIONAL_SCRIPTS) {
      if(hasNeededSourceFiles(ns,neededSF || [])){
        ns.tprint(`INFO: All SF requirements met for ${path}`);
      } else {
        ns.tprint(`INFO: Skipping ${path} — missing required Source Files: ${neededSF?.join(", ")}`);
        continue;
      }  
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
