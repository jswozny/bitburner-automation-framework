/**
 * Dashboard State Store
 *
 * Module-level state that persists across React re-renders (printRaw calls).
 * Now reads status from ports (published by daemons) instead of calling
 * controller functions directly. This eliminates heavy RAM imports.
 *
 * Uses NetscriptPort for React→MainLoop communication to avoid click loss issues.
 */
import { NetscriptPort, NS } from "@ns";
import { peekStatus } from "/lib/ports";
import {
  ToolName,
  DashboardState,
  TOOL_SCRIPTS,
  KILL_TIERS,
  STATUS_PORTS,
  COMMAND_PORT,
  NukeStatus,
  PservStatus,
  ShareStatus,
  RepStatus,
  HackStatus,
  DarkwebStatus,
  WorkStatus,
  BitnodeStatus,
  Command,
} from "/types/ports";

// === COMMAND PORT ===

let commandPort: NetscriptPort | null = null;

/**
 * Initialize the command port for React→MainLoop communication.
 */
export function initCommandPort(ns: NS): void {
  commandPort = ns.getPortHandle(COMMAND_PORT);
  commandPort.clear();
}

/**
 * Write a command to the port.
 */
export function writeCommand(
  tool: ToolName,
  action: Command["action"],
  scriptPath?: string,
  scriptArgs?: string[]
): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool, action, scriptPath, scriptArgs }));
}

/**
 * Open tail for a running tool.
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
export function startFactionWork(factionName: string, workType: "hacking" | "field" | "security" = "hacking"): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "rep", action: "start-faction-work", factionName, workType }));
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
 * Install all pending augmentations (triggers a soft reset).
 */
export function installAugments(): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "rep", action: "install-augments" }));
}

/**
 * Run backdoors with auto-fallback to manual tool if RAM is insufficient.
 */
export function runBackdoors(): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "rep", action: "run-backdoors" }));
}

/**
 * Restart the rep daemon, optionally with a faction focus override.
 */
export function restartRepDaemon(factionFocus?: string): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "rep", action: "restart-rep-daemon", factionFocus }));
}

/**
 * Read and execute all pending commands from the port.
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
 * Execute a single command — dispatches to action scripts instead of
 * calling controller functions directly.
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
        const workType = cmd.workType ?? "hacking";
        const pid = ns.exec("actions/work-for-faction.js", "home", 1, "--faction", cmd.factionName, "--type", workType, "--focus");
        if (pid > 0) {
          ns.toast(`Started ${workType} work for ${cmd.factionName}`, "success", 2000);
        } else {
          ns.toast(`Failed to start work for ${cmd.factionName}`, "error", 3000);
        }
      }
      break;
    case "set-focus":
      if (cmd.focus) {
        const pid = ns.exec("actions/set-work-focus.js", "home", 1, "--focus", cmd.focus);
        if (pid > 0) {
          ns.toast(`Work focus: ${cmd.focus}`, "success", 2000);
        } else {
          ns.toast(`Failed to set focus`, "error", 3000);
        }
      }
      break;
    case "start-training":
      {
        // Queue a training start through the work daemon or action
        const pid = ns.exec("actions/start-gym.js", "home", 1, "--stat", "str");
        if (pid > 0) {
          ns.toast("Training started", "success", 2000);
        } else {
          ns.toast("Could not start training (not enough RAM?)", "warning", 3000);
        }
      }
      break;
    case "install-augments":
      {
        const pid = ns.exec("actions/install-augments.js", "home", 1, "--confirm");
        if (pid > 0) {
          ns.toast("Installing augmentations...", "info", 2000);
        } else {
          ns.toast("Failed to launch install-augments (not enough RAM)", "error", 3000);
        }
      }
      break;
    case "run-backdoors":
      {
        const pid = ns.exec("actions/faction-backdoors.js", "home", 1);
        if (pid > 0) {
          ns.toast("Running auto-backdoors...", "success", 2000);
        } else {
          // Fallback to manual tool
          const fallbackPid = ns.exec("tools/backdoor.js", "home", 1);
          if (fallbackPid > 0) {
            ns.toast("Auto-backdoor needs more RAM. Opened manual backdoor tool.", "warning", 4000);
          } else {
            ns.toast("Failed to start backdoor tool (not enough RAM)", "error", 3000);
          }
        }
      }
      break;
    case "restart-rep-daemon":
      {
        const currentRepPid = cachedData.pids.rep;
        if (currentRepPid > 0) {
          ns.kill(currentRepPid);
          cachedData.pids.rep = 0;
        }
        const args: string[] = [];
        if (cmd.factionFocus) {
          args.push("--faction", cmd.factionFocus);
        }
        const newPid = ns.exec("daemons/rep.js", "home", 1, ...args);
        if (newPid > 0) {
          cachedData.pids.rep = newPid;
          ns.toast(cmd.factionFocus ? `Rep daemon: focusing ${cmd.factionFocus}` : "Rep daemon: auto-select mode", "success", 2000);
        } else {
          ns.toast("Failed to restart rep daemon (not enough RAM)", "error", 3000);
        }
      }
      break;
  }
}

/**
 * Open tail for a tool's process.
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

export function getActiveTab(): number {
  return uiState.activeTab;
}

export function setActiveTab(tab: number): void {
  uiState.activeTab = tab;
}

export function getPluginUIState<T>(plugin: ToolName, key: string, defaultVal: T): T {
  const pluginState = uiState.pluginUIState[plugin];
  if (pluginState && key in pluginState) {
    return pluginState[key] as T;
  }
  return defaultVal;
}

export function setPluginUIState(plugin: ToolName, key: string, value: unknown): void {
  uiState.pluginUIState[plugin][key] = value;
}

// === CACHED DATA ===

interface CachedData {
  pids: Record<ToolName, number>;
  nukeStatus: NukeStatus | null;
  pservStatus: PservStatus | null;
  shareStatus: ShareStatus | null;
  repStatus: RepStatus | null;
  repError: string | null;
  hackStatus: HackStatus | null;
  darkwebStatus: DarkwebStatus | null;
  darkwebError: string | null;
  workStatus: WorkStatus | null;
  workError: string | null;
  bitnodeStatus: BitnodeStatus | null;
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
};

// === PORT-BASED STATUS READING ===

/**
 * Read all status ports and update cached data.
 * Replaces the old updatePluginsIfNeeded() which called controller functions.
 * This is extremely lightweight — just port.peek() + JSON.parse.
 */
export function readStatusPorts(ns: NS): void {
  cachedData.nukeStatus = peekStatus<NukeStatus>(ns, STATUS_PORTS.nuke);
  cachedData.hackStatus = peekStatus<HackStatus>(ns, STATUS_PORTS.hack);
  cachedData.pservStatus = peekStatus<PservStatus>(ns, STATUS_PORTS.pserv);
  cachedData.shareStatus = peekStatus<ShareStatus>(ns, STATUS_PORTS.share);

  const rep = peekStatus<RepStatus>(ns, STATUS_PORTS.rep);
  if (rep) {
    cachedData.repStatus = rep;
    cachedData.repError = null;
  }

  const work = peekStatus<WorkStatus>(ns, STATUS_PORTS.work);
  if (work) {
    cachedData.workStatus = work;
    cachedData.workError = null;
  }

  const darkweb = peekStatus<DarkwebStatus>(ns, STATUS_PORTS.darkweb);
  if (darkweb) {
    cachedData.darkwebStatus = darkweb;
    cachedData.darkwebError = null;
  }

  cachedData.bitnodeStatus = peekStatus<BitnodeStatus>(ns, STATUS_PORTS.bitnode);
}

// === TOOL CONTROL ===

function startTool(ns: NS, tool: ToolName): void {
  const currentPid = cachedData.pids[tool];
  if (currentPid > 0 && ns.isRunning(currentPid)) {
    return;
  }

  const script = TOOL_SCRIPTS[tool];
  const requiredRam = ns.getScriptRam(script, "home");
  if (requiredRam <= 0) {
    ns.toast(`Unknown script: ${script}`, "error", 4000);
    return;
  }

  let available = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");

  // If not enough RAM, walk kill tiers but SKIP the last tier (dashboard itself)
  if (available < requiredRam) {
    const safeTiers = KILL_TIERS.slice(0, -1);
    let deficit = requiredRam - available;

    for (const tierScripts of safeTiers) {
      if (deficit <= 0) break;
      const processes = ns.ps("home");
      const tierProcs = processes
        .filter(p => tierScripts.includes(p.filename))
        .sort((a, b) => (ns.getScriptRam(b.filename, "home") * b.threads)
                      - (ns.getScriptRam(a.filename, "home") * a.threads));
      for (const proc of tierProcs) {
        if (deficit <= 0) break;
        ns.kill(proc.pid);
        deficit -= ns.getScriptRam(proc.filename, "home") * proc.threads;
      }
    }

    available = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  }

  if (available < requiredRam) {
    ns.toast(
      `Not enough RAM for ${tool} (need ${ns.formatRam(requiredRam)}, ` +
      `have ${ns.formatRam(available)}). Launch from CLI: run ${script}`,
      "error", 6000
    );
    return;
  }

  const pid = ns.exec(script, "home");
  if (pid > 0) {
    cachedData.pids[tool] = pid;
    ns.toast(`Started ${tool}`, "success", 2000);
  } else {
    ns.toast(`Failed to start ${tool}`, "error", 4000);
  }
}

function stopTool(ns: NS, tool: ToolName): void {
  const pid = cachedData.pids[tool];
  if (pid > 0) {
    ns.kill(pid);
    cachedData.pids[tool] = 0;
    ns.toast(`Stopped ${tool}`, "warning", 2000);
  }
}

export function isToolRunning(tool: ToolName): boolean {
  return cachedData.pids[tool] > 0;
}

export function getToolPid(tool: ToolName): number {
  return cachedData.pids[tool];
}

export function setToolPid(tool: ToolName, pid: number): void {
  cachedData.pids[tool] = pid;
}

// === RUNNING TOOL DETECTION ===

export function detectRunningTools(ns: NS): void {
  const processes = ns.ps("home");
  for (const tool of Object.keys(TOOL_SCRIPTS) as ToolName[]) {
    const script = TOOL_SCRIPTS[tool];
    const proc = processes.find(p => p.filename === script);
    if (proc) {
      cachedData.pids[tool] = proc.pid;
    } else if (cachedData.pids[tool] > 0 && !ns.isRunning(cachedData.pids[tool])) {
      cachedData.pids[tool] = 0;
    }
  }
}

export function syncPidState(ns: NS): void {
  for (const tool of Object.keys(cachedData.pids) as ToolName[]) {
    if (cachedData.pids[tool] > 0 && !ns.isRunning(cachedData.pids[tool])) {
      cachedData.pids[tool] = 0;
    }
  }
}

// === STATE SNAPSHOT ===

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
