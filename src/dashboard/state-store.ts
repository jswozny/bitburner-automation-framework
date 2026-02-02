/**
 * Dashboard State Store
 *
 * Module-level state that persists across React re-renders (printRaw calls).
 * Since JavaScript module state persists even when React components are recreated,
 * we store ALL state here and use React as a pure view layer.
 *
 * Uses NetscriptPort for React→MainLoop communication to avoid click loss issues.
 * Port methods have no context validation, so they're safe to call from React handlers.
 */
import { NetscriptPort, NS } from "@ns";
import {
  ToolName,
  DashboardState,
  TOOL_SCRIPTS,
  FormattedNukeStatus,
  FormattedPservStatus,
  FormattedShareStatus,
  FormattedRepStatus,
  FormattedHackStatus,
  FormattedDarkwebStatus,
  FormattedWorkStatus,
  BitnodeStatus,
} from "dashboard/types";
import { startOptimalFactionWork } from "lib/factions";
import { setWorkFocus, runWorkCycle, WorkFocus } from "lib/work";

// === COMMAND PORT ===

const COMMAND_PORT = 20; // Port for dashboard command communication

interface Command {
  tool: ToolName;
  action: "start" | "stop" | "open-tail" | "run-script" | "start-faction-work" | "set-focus" | "start-training";
  scriptPath?: string;
  scriptArgs?: string[];
  factionName?: string;
  focus?: string;
}

let commandPort: NetscriptPort | null = null;

/**
 * Initialize the command port for React→MainLoop communication.
 * Called once at the start of the main loop.
 */
export function initCommandPort(ns: NS): void {
  commandPort = ns.getPortHandle(COMMAND_PORT);
  commandPort.clear(); // Clear any stale commands from previous runs
}

/**
 * Write a command to the port.
 * Called from React handlers - safe because port.write() has no NS context check.
 */
export function writeCommand(
  tool: ToolName,
  action: "start" | "stop" | "open-tail" | "run-script",
  scriptPath?: string,
  scriptArgs?: string[]
): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool, action, scriptPath, scriptArgs }));
}

/**
 * Open tail window for a running tool.
 */
export function openToolTail(tool: ToolName): void {
  writeCommand(tool, "open-tail");
}

/**
 * Run a one-off script.
 */
export function runScript(tool: ToolName, scriptPath: string, scriptArgs: string[] = []): void {
  writeCommand(tool, "run-script", scriptPath, scriptArgs);
}

/**
 * Start optimal faction work with focus.
 */
export function startFactionWork(factionName: string): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "rep", action: "start-faction-work", factionName }));
}

/**
 * Set work focus for training.
 */
export function writeWorkFocusCommand(focus: string): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "work", action: "set-focus", focus }));
}

/**
 * Start training based on current focus.
 */
export function writeStartTrainingCommand(): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "work", action: "start-training" }));
}

/**
 * Read and execute all pending commands from the port.
 * Called from main loop - receives fresh NS reference each call.
 */
export function readAndExecuteCommands(ns: NS): void {
  if (!commandPort) return;

  while (!commandPort.empty()) {
    const data = commandPort.read();
    if (data === "NULL PORT DATA") break;

    try {
      const cmd = JSON.parse(data as string) as Command;
      executeCommand(ns, cmd);
    } catch {
      // Invalid command data, skip
    }
  }
}

/**
 * Execute a single command using the provided NS reference.
 */
function executeCommand(ns: NS, cmd: Command): void {
  switch (cmd.action) {
    case "start":
      startTool(ns, cmd.tool);
      break;
    case "stop":
      stopTool(ns, cmd.tool);
      break;
    case "open-tail":
      openTail(ns, cmd.tool);
      break;
    case "run-script":
      if (cmd.scriptPath) {
        executeScript(ns, cmd.scriptPath, cmd.scriptArgs || []);
      }
      break;
    case "start-faction-work":
      if (cmd.factionName) {
        const player = ns.getPlayer();
        if (startOptimalFactionWork(ns, player, cmd.factionName)) {
          ns.toast(`Started ${cmd.factionName} work (focused)`, "success", 2000);
        } else {
          ns.toast(`Failed to start work for ${cmd.factionName}`, "error", 3000);
        }
      }
      break;
    case "set-focus":
      if (cmd.focus) {
        setWorkFocus(ns, cmd.focus as WorkFocus);
        ns.toast(`Work focus: ${cmd.focus}`, "success", 2000);
      }
      break;
    case "start-training":
      {
        const started = runWorkCycle(ns);
        if (started) {
          ns.toast("Training started", "success", 2000);
        } else {
          ns.toast("Could not start training", "warning", 3000);
        }
      }
      break;
  }
}

/**
 * Open tail window for a tool's process.
 */
function openTail(ns: NS, tool: ToolName): void {
  const pid = cachedData.pids[tool];
  if (pid > 0) {
    ns.ui.openTail(pid);
  }
}

/**
 * Execute a one-off script.
 */
function executeScript(ns: NS, scriptPath: string, args: string[]): void {
  const pid = ns.exec(scriptPath, "home", 1, ...args);
  if (pid > 0) {
    ns.toast(`Started ${scriptPath}`, "success", 2000);
  } else {
    ns.toast(`Failed to start ${scriptPath}`, "error", 4000);
  }
}

// === UI STATE ===

interface UIState {
  activeTab: number;
  pluginUIState: Record<ToolName, Record<string, unknown>>;
}

const uiState: UIState = {
  activeTab: 0,
  pluginUIState: {
    nuke: {},
    pserv: {},
    share: {},
    rep: {},
    hack: {},
    darkweb: {},
    work: {},
  },
};

/**
 * Get the current active tab index.
 */
export function getActiveTab(): number {
  return uiState.activeTab;
}

/**
 * Set the active tab index.
 */
export function setActiveTab(tab: number): void {
  uiState.activeTab = tab;
}

/**
 * Get a plugin-specific UI state value.
 */
export function getPluginUIState<T>(plugin: ToolName, key: string, defaultVal: T): T {
  const pluginState = uiState.pluginUIState[plugin];
  if (pluginState && key in pluginState) {
    return pluginState[key] as T;
  }
  return defaultVal;
}

/**
 * Set a plugin-specific UI state value.
 */
export function setPluginUIState(plugin: ToolName, key: string, value: unknown): void {
  uiState.pluginUIState[plugin][key] = value;
}

// === CACHED DATA ===

interface CachedData {
  pids: Record<ToolName, number>;
  nukeStatus: FormattedNukeStatus | null;
  pservStatus: FormattedPservStatus | null;
  shareStatus: FormattedShareStatus | null;
  repStatus: FormattedRepStatus | null;
  repError: string | null;
  hackStatus: FormattedHackStatus | null;
  darkwebStatus: FormattedDarkwebStatus | null;
  darkwebError: string | null;
  workStatus: FormattedWorkStatus | null;
  workError: string | null;
  bitnodeStatus: BitnodeStatus | null;
  lastUpdated: Record<ToolName, number>;
}

const cachedData: CachedData = {
  pids: { nuke: 0, pserv: 0, share: 0, rep: 0, hack: 0, darkweb: 0, work: 0 },
  nukeStatus: null,
  pservStatus: null,
  shareStatus: null,
  repStatus: null,
  repError: null,
  hackStatus: null,
  darkwebStatus: null,
  darkwebError: null,
  workStatus: null,
  workError: null,
  bitnodeStatus: null,
  lastUpdated: { nuke: 0, pserv: 0, share: 0, rep: 0, hack: 0, darkweb: 0, work: 0 },
};

// === PLUGIN UPDATE INTERVALS ===

const PLUGIN_INTERVALS: Record<ToolName, number> = {
  nuke: 2000,   // Slower - server state doesn't change fast
  pserv: 3000,  // Slow - purchased servers rarely change
  share: 2000,  // Medium
  rep: 1000,    // Fast - rep changes constantly
  hack: 1500,   // Heavy plugin, moderate interval
  darkweb: 5000, // Slow - program ownership rarely changes
  work: 1000,   // Fast - training status updates frequently
};

/**
 * Check if a plugin needs to be updated based on its interval.
 */
export function shouldUpdatePlugin(plugin: ToolName, now: number): boolean {
  const lastUpdate = cachedData.lastUpdated[plugin];
  const interval = PLUGIN_INTERVALS[plugin];
  return now - lastUpdate >= interval;
}

/**
 * Mark a plugin as updated.
 */
export function markPluginUpdated(plugin: ToolName, now: number): void {
  cachedData.lastUpdated[plugin] = now;
}

/**
 * Update a plugin's cached status.
 */
export function setCachedStatus(
  plugin: ToolName,
  status: FormattedNukeStatus | FormattedPservStatus | FormattedShareStatus | FormattedRepStatus | FormattedHackStatus | FormattedDarkwebStatus | FormattedWorkStatus | null
): void {
  switch (plugin) {
    case "nuke":
      cachedData.nukeStatus = status as FormattedNukeStatus | null;
      break;
    case "pserv":
      cachedData.pservStatus = status as FormattedPservStatus | null;
      break;
    case "share":
      cachedData.shareStatus = status as FormattedShareStatus | null;
      break;
    case "rep":
      cachedData.repStatus = status as FormattedRepStatus | null;
      break;
    case "hack":
      cachedData.hackStatus = status as FormattedHackStatus | null;
      break;
    case "darkweb":
      cachedData.darkwebStatus = status as FormattedDarkwebStatus | null;
      break;
    case "work":
      cachedData.workStatus = status as FormattedWorkStatus | null;
      break;
  }
}

/**
 * Set the rep error message.
 */
export function setRepError(error: string | null): void {
  cachedData.repError = error;
}

/**
 * Set the darkweb error message.
 */
export function setDarkwebError(error: string | null): void {
  cachedData.darkwebError = error;
}

/**
 * Set the work error message.
 */
export function setWorkError(error: string | null): void {
  cachedData.workError = error;
}

/**
 * Set the bitnode completion status.
 */
export function setBitnodeStatus(status: BitnodeStatus | null): void {
  cachedData.bitnodeStatus = status;
}

// === TOOL CONTROL ===

/**
 * Start a tool. Called via executeCommand with fresh NS reference.
 */
function startTool(ns: NS, tool: ToolName): void {
  const currentPid = cachedData.pids[tool];
  if (currentPid > 0 && ns.isRunning(currentPid)) {
    return; // Already running
  }

  const script = TOOL_SCRIPTS[tool];
  const pid = ns.exec(script, "home");

  if (pid > 0) {
    cachedData.pids[tool] = pid;
    ns.toast(`Started ${tool}`, "success", 2000);
  } else {
    ns.toast(`Failed to start ${tool} - check RAM/script exists`, "error", 4000);
  }
}

/**
 * Stop a tool. Called via executeCommand with fresh NS reference.
 */
function stopTool(ns: NS, tool: ToolName): void {
  const pid = cachedData.pids[tool];
  if (pid > 0) {
    ns.kill(pid);
    cachedData.pids[tool] = 0;
    ns.toast(`Stopped ${tool}`, "warning", 2000);
  }
}

/**
 * Check if a tool is running.
 */
export function isToolRunning(tool: ToolName): boolean {
  return cachedData.pids[tool] > 0;
}

/**
 * Get the PID of a tool.
 */
export function getToolPid(tool: ToolName): number {
  return cachedData.pids[tool];
}

/**
 * Set the PID of a tool (used during detection).
 */
export function setToolPid(tool: ToolName, pid: number): void {
  cachedData.pids[tool] = pid;
}

// === RUNNING TOOL DETECTION ===

/**
 * Detect tools that are already running (started manually or before restart).
 * Takes NS as parameter for proper context handling.
 */
export function detectRunningTools(ns: NS): void {
  const processes = ns.ps("home");
  for (const tool of Object.keys(TOOL_SCRIPTS) as ToolName[]) {
    const script = TOOL_SCRIPTS[tool];
    const proc = processes.find(p => p.filename === script);
    if (proc) {
      cachedData.pids[tool] = proc.pid;
    } else if (cachedData.pids[tool] > 0 && !ns.isRunning(cachedData.pids[tool])) {
      cachedData.pids[tool] = 0; // Script stopped
    }
  }
}

/**
 * Sync PID state - remove dead PIDs.
 * Takes NS as parameter for proper context handling.
 */
export function syncPidState(ns: NS): void {
  for (const tool of Object.keys(cachedData.pids) as ToolName[]) {
    if (cachedData.pids[tool] > 0 && !ns.isRunning(cachedData.pids[tool])) {
      cachedData.pids[tool] = 0;
    }
  }
}

// === STATE SNAPSHOT ===

/**
 * Get a snapshot of the current state for React rendering.
 */
export function getStateSnapshot(): DashboardState {
  return {
    pids: { ...cachedData.pids },
    nukeStatus: cachedData.nukeStatus,
    pservStatus: cachedData.pservStatus,
    shareStatus: cachedData.shareStatus,
    repStatus: cachedData.repStatus,
    repError: cachedData.repError,
    hackStatus: cachedData.hackStatus,
    darkwebStatus: cachedData.darkwebStatus,
    darkwebError: cachedData.darkwebError,
    workStatus: cachedData.workStatus,
    workError: cachedData.workError,
    bitnodeStatus: cachedData.bitnodeStatus,
  };
}
