/**
 * Dashboard State Management
 *
 * Module-level state that persists across React re-renders.
 * Commands queue for React -> main loop communication.
 */
import { NS } from "@ns";
import { ToolName, PendingCommand, DashboardState, TOOL_SCRIPTS } from "dashboard/types";

// === MODULE-LEVEL STATE ===

/** Currently active tab index */
export let currentActiveTab = 0;

/** Command queue for React -> main loop communication */
export const pendingCommands: PendingCommand[] = [];

/** Command port number */
export const COMMAND_PORT = 1;

// === STATE MUTATIONS ===

export function setActiveTab(tab: number): void {
  currentActiveTab = tab;
}

export function queueCommand(tool: ToolName, action: "start" | "stop"): void {
  pendingCommands.push({ tool, action });
}

// === TOOL CONTROL ===

export function startTool(ns: NS, tool: ToolName, state: DashboardState): void {
  if (state.pids[tool] > 0 && ns.isRunning(state.pids[tool])) {
    return; // Already running
  }

  const script = TOOL_SCRIPTS[tool];
  const pid = ns.exec(script, "home");

  if (pid > 0) {
    state.pids[tool] = pid;
    ns.toast(`Started ${tool}`, "success", 2000);
  } else {
    ns.toast(`Failed to start ${tool} - check RAM/script exists`, "error", 4000);
  }
}

export function stopTool(ns: NS, tool: ToolName, state: DashboardState): void {
  if (state.pids[tool] > 0) {
    ns.kill(state.pids[tool]);
    state.pids[tool] = 0;
    ns.toast(`Stopped ${tool}`, "warning", 2000);
  }
}

// === COMMAND PROCESSING ===

export function processPendingCommands(ns: NS, state: DashboardState): void {
  while (pendingCommands.length > 0) {
    const cmd = pendingCommands.shift()!;
    if (cmd.action === "start") {
      startTool(ns, cmd.tool, state);
    } else {
      stopTool(ns, cmd.tool, state);
    }
  }
}

export function syncPidState(ns: NS, state: DashboardState): void {
  for (const tool of Object.keys(state.pids) as ToolName[]) {
    if (state.pids[tool] > 0 && !ns.isRunning(state.pids[tool])) {
      state.pids[tool] = 0;
    }
  }
}

export function detectRunningTools(ns: NS, state: DashboardState): void {
  const processes = ns.ps("home");
  for (const tool of Object.keys(TOOL_SCRIPTS) as ToolName[]) {
    const script = TOOL_SCRIPTS[tool];
    const proc = processes.find(p => p.filename === script);
    if (proc) {
      state.pids[tool] = proc.pid;
    } else if (state.pids[tool] > 0 && !ns.isRunning(state.pids[tool])) {
      state.pids[tool] = 0; // Script stopped
    }
  }
}
