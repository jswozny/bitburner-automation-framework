import { NS } from "@ns";

/**
 * Dashboard Control Script
 *
 * Send commands to the dashboard via port 1.
 * Note: Tabs are now changed by clicking in the UI.
 *
 * Usage:
 *   run dashboard/dashboard-ctl.js <tool> <start|stop>
 *   run dashboard/dashboard-ctl.js all <start|stop>
 *
 * Examples:
 *   run dashboard/dashboard-ctl.js nuke start
 *   run dashboard/dashboard-ctl.js pserv stop
 *   run dashboard/dashboard-ctl.js all start
 */

const COMMAND_PORT = 1;

type ToolName = "nuke" | "pserv" | "share" | "rep" | "all";

interface DashboardCommand {
  type: "toggle" | "tab";
  tool?: ToolName;
  action?: "start" | "stop";
  tab?: number;
}

export async function main(ns: NS): Promise<void> {
  const args = ns.args;

  if (args.length < 2) {
    ns.tprint("Usage: run dashboard/dashboard-ctl.js <tool> <start|stop>");
    ns.tprint("");
    ns.tprint("Tools: nuke, pserv, share, rep, all");
    ns.tprint("Note:  Tabs are changed by clicking in the dashboard UI");
    return;
  }

  const first = String(args[0]).toLowerCase();
  const second = String(args[1]).toLowerCase();

  const validTools = ["nuke", "pserv", "share", "rep", "all"];
  const validActions = ["start", "stop"];

  if (!validTools.includes(first)) {
    ns.tprint(`ERROR: Unknown tool '${first}'. Valid: ${validTools.join(", ")}`);
    return;
  }

  if (!validActions.includes(second)) {
    ns.tprint(`ERROR: Unknown action '${second}'. Valid: start, stop`);
    return;
  }

  const cmd: DashboardCommand = {
    type: "toggle",
    tool: first as ToolName,
    action: second as "start" | "stop",
  };

  // Write command to port
  const port = ns.getPortHandle(COMMAND_PORT);
  port.write(JSON.stringify(cmd));

  ns.tprint(`Command sent: ${JSON.stringify(cmd)}`);
}
