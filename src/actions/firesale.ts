/**
 * Firesale Action
 *
 * Pre-augment-install prep: liquidate stocks, stop spenders, set hack to drain.
 * Target RAM: ~2 GB (ps + kill + exec)
 *
 * Usage: run actions/firesale.js
 */
import { NS } from "@ns";
import { setConfigValue } from "/lib/config";
import { TOOL_SCRIPTS, ToolName } from "/types/ports";

const KILL_TOOLS: ToolName[] = [
  "stocks", "budget", "darkweb", "pserv", "gang", "home",
  "infiltration", "work", "share", "rep", "faction",
];

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  // Sell all stocks via existing script
  ns.exec("tools/control/sell-all-stocks.js", "home");

  // Kill spending daemons
  const procs = ns.ps("home");
  const killScripts = new Set(KILL_TOOLS.map(t => TOOL_SCRIPTS[t]));
  for (const proc of procs) {
    if (killScripts.has(proc.filename)) {
      ns.kill(proc.pid);
    }
  }

  // Set hack to drain mode, disable pserv auto-buy
  setConfigValue(ns, "hack", "strategy", "drain");
  setConfigValue(ns, "pserv", "autoBuy", "false");

  ns.toast("Firesale complete", "success", 3000);
}
