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
  INFILTRATION_CONTROL_PORT,
  GANG_CONTROL_PORT,
  NukeStatus,
  PservStatus,
  ShareStatus,
  RepStatus,
  HackStatus,
  HackStrategy,
  DarkwebStatus,
  WorkStatus,
  BitnodeStatus,
  FactionStatus,
  FleetAllocation,
  InfiltrationStatus,
  GangStatus,
  GangStrategy,
  AugmentsStatus,
  AdvisorStatus,
  ContractsStatus,
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
  commandPort.write(JSON.stringify({ tool: "augments", action: "install-augments" }));
}

/**
 * Buy only selected augmentations by name.
 */
export function buySelectedAugments(augNames: string[]): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "augments", action: "buy-selected-augments", selectedAugs: augNames }));
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
 * Join a faction via the command port (dispatches to join-faction action).
 */
export function joinFactionCommand(factionName: string): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "faction", action: "join-faction", factionName }));
}

/**
 * Restart the faction daemon, optionally with a preferred city override.
 */
export function restartFactionDaemon(cityFaction?: string): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "faction", action: "restart-faction-daemon", cityFaction }));
}

/**
 * Restart the hack daemon with new strategy/batch settings.
 * Share% is now auto-detected by hack from the share status port.
 */
export function restartHackDaemon(
  strategy?: HackStrategy,
  maxBatches?: number,
  homeReserve?: number,
): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({
    tool: "hack",
    action: "restart-hack-daemon",
    hackStrategy: strategy,
    hackMaxBatches: maxBatches,
    hackHomeReserve: homeReserve,
  }));
}

/**
 * Restart the share daemon with a target percent cap.
 */
export function restartShareDaemon(targetPercent?: number): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({
    tool: "share",
    action: "restart-share-daemon",
    shareTargetPercent: targetPercent,
  }));
}

/**
 * Send a configure command to the infiltration daemon.
 */
export function configureInfiltration(rewardMode?: "rep" | "money"): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({
    tool: "infiltration",
    action: "configure-infiltration",
    infiltrationRewardMode: rewardMode,
  }));
}

/**
 * Set gang strategy via command port.
 */
export function setGangStrategy(strategy: GangStrategy): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "set-gang-strategy", gangStrategy: strategy }));
}

/**
 * Pin a gang member to a specific task.
 */
export function pinGangMember(memberName: string, task: string): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "pin-gang-member", gangMemberName: memberName, gangMemberTask: task }));
}

/**
 * Unpin a gang member.
 */
export function unpinGangMember(memberName: string): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "unpin-gang-member", gangMemberName: memberName }));
}

/**
 * Request ascension for a gang member.
 */
export function ascendGangMember(memberName: string): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "ascend-gang-member", gangMemberName: memberName }));
}

/**
 * Toggle gang equipment purchases.
 */
export function toggleGangPurchases(enabled: boolean): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "toggle-gang-purchases", gangPurchasesEnabled: enabled }));
}

/**
 * Set gang wanted threshold.
 */
export function setGangWantedThreshold(threshold: number): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "set-gang-wanted-threshold", gangWantedThreshold: threshold }));
}

/**
 * Set gang training threshold (min avg combat stat before strategy kicks in).
 */
export function setGangTrainingThreshold(threshold: number): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "set-gang-training-threshold", gangTrainingThreshold: threshold }));
}

/**
 * Set gang ascension thresholds.
 */
export function setGangAscensionThresholds(autoThreshold: number, reviewThreshold: number): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "set-gang-ascension-thresholds", gangAscendAutoThreshold: autoThreshold, gangAscendReviewThreshold: reviewThreshold }));
}

/**
 * Set gang grow target multiplier.
 */
export function setGangGrowTarget(multiplier: number): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "set-gang-grow-target", gangGrowTargetMultiplier: multiplier }));
}

/**
 * Set gang grow respect reserve count.
 */
export function setGangGrowRespectReserve(count: number): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "set-gang-grow-respect-reserve", gangGrowRespectReserve: count }));
}

/**
 * Force-buy all affordable gang equipment (ignores spending cap).
 */
export function forceGangEquipmentBuy(): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "force-buy-equipment" }));
}

/**
 * Restart the gang daemon with optional strategy.
 */
export function restartGangDaemon(strategy?: GangStrategy): void {
  if (!commandPort) return;
  commandPort.write(JSON.stringify({ tool: "gang", action: "restart-gang-daemon", gangStrategy: strategy }));
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
    case "join-faction":
      if (cmd.factionName) {
        const pid = ns.exec("actions/join-faction.js", "home", 1, "--faction", cmd.factionName);
        if (pid > 0) {
          ns.toast(`Joining ${cmd.factionName}...`, "info", 2000);
        } else {
          ns.toast(`Failed to launch join-faction (not enough RAM)`, "error", 3000);
        }
      }
      break;
    case "restart-faction-daemon":
      {
        const currentFactionPid = cachedData.pids.faction;
        if (currentFactionPid > 0) {
          ns.kill(currentFactionPid);
          cachedData.pids.faction = 0;
        }
        if (cmd.cityFaction) {
          // Write preferred city to config file (daemon reads from config, not flags)
          const raw = ns.read("/config/faction.txt") || "# faction Config\ninterval=10000\noneShot=false\npreferredCity=\nnoKill=false";
          const updated = raw.replace(/preferredCity=.*/, `preferredCity=${cmd.cityFaction}`);
          ns.write("/config/faction.txt", updated, "w");
        }
        const factionPid = ns.exec("daemons/faction.js", "home", 1);
        if (factionPid > 0) {
          cachedData.pids.faction = factionPid;
          ns.toast(cmd.cityFaction ? `Faction daemon: preferred ${cmd.cityFaction}` : "Faction daemon restarted", "success", 2000);
        } else {
          ns.toast("Failed to restart faction daemon (not enough RAM)", "error", 3000);
        }
      }
      break;
    case "restart-hack-daemon":
      {
        const currentHackPid = cachedData.pids.hack;
        if (currentHackPid > 0) {
          ns.kill(currentHackPid);
          cachedData.pids.hack = 0;
        }
        const hackArgs: string[] = [];
        if (cmd.hackStrategy) hackArgs.push("--strategy", cmd.hackStrategy);
        if (cmd.hackMaxBatches !== undefined) hackArgs.push("--max-batches", String(cmd.hackMaxBatches));
        if (cmd.hackHomeReserve !== undefined) hackArgs.push("--home-reserve", String(cmd.hackHomeReserve));
        const hackPid = ns.exec("daemons/hack.js", "home", 1, ...hackArgs);
        if (hackPid > 0) {
          cachedData.pids.hack = hackPid;
          ns.toast(`Hack daemon: ${cmd.hackStrategy ?? "money"} mode`, "success", 2000);
        } else {
          ns.toast("Failed to restart hack daemon (not enough RAM)", "error", 3000);
        }
        saveDashboardSettings(ns);
      }
      break;
    case "restart-share-daemon":
      {
        const currentSharePid = cachedData.pids.share;
        if (currentSharePid > 0) {
          ns.kill(currentSharePid);
          cachedData.pids.share = 0;
        }
        const shareArgs: string[] = [];
        if (cmd.shareTargetPercent !== undefined && cmd.shareTargetPercent > 0) {
          shareArgs.push("--target-percent", String(cmd.shareTargetPercent));
        }
        const sharePid = ns.exec("daemons/share.js", "home", 1, ...shareArgs);
        if (sharePid > 0) {
          cachedData.pids.share = sharePid;
          const label = cmd.shareTargetPercent && cmd.shareTargetPercent > 0
            ? `Share daemon: ${cmd.shareTargetPercent}% cap`
            : "Share daemon: greedy mode";
          ns.toast(label, "success", 2000);
        } else {
          ns.toast("Failed to restart share daemon (not enough RAM)", "error", 3000);
        }
        saveDashboardSettings(ns);
      }
      break;
    case "stop-infiltration":
      {
        // Send stop signal to infiltration daemon via its control port
        const ctrlHandle = ns.getPortHandle(INFILTRATION_CONTROL_PORT);
        ctrlHandle.write(JSON.stringify({ action: "stop" }));
        ns.toast("Infiltration: stop requested (after current run)", "warning", 3000);
      }
      break;
    case "kill-infiltration":
      {
        const infPid = cachedData.pids.infiltration;
        if (infPid > 0) {
          ns.kill(infPid);
          cachedData.pids.infiltration = 0;
          cachedData.infiltrationStatus = null;
          ns.toast("Infiltration daemon killed", "warning", 2000);
        }
      }
      break;
    case "configure-infiltration":
      {
        const ctrlHandle = ns.getPortHandle(INFILTRATION_CONTROL_PORT);
        ctrlHandle.write(JSON.stringify({
          action: "configure",
          target: cmd.infiltrationTarget,
          solvers: cmd.infiltrationSolvers,
          rewardMode: cmd.infiltrationRewardMode,
        }));
        if (cmd.infiltrationRewardMode) {
          saveDashboardSettings(ns);
        }
        ns.toast("Infiltration config updated", "info", 2000);
      }
      break;
    case "set-gang-strategy":
    case "pin-gang-member":
    case "unpin-gang-member":
    case "ascend-gang-member":
    case "toggle-gang-purchases":
    case "set-gang-wanted-threshold":
    case "set-gang-ascension-thresholds":
    case "set-gang-training-threshold":
    case "set-gang-grow-target":
    case "set-gang-grow-respect-reserve":
    case "force-buy-equipment":
      {
        // Forward gang commands to the gang control port
        const gangCtrl = ns.getPortHandle(GANG_CONTROL_PORT);
        gangCtrl.write(JSON.stringify(cmd));
        ns.toast(`Gang: ${cmd.action.replace("gang-", "").replace(/-/g, " ")}`, "info", 2000);
      }
      break;
    case "buy-selected-augments":
      {
        if (cmd.selectedAugs && cmd.selectedAugs.length > 0) {
          const script = "actions/purchase-augments.js";
          const args = ["--only", JSON.stringify(cmd.selectedAugs)];
          const requiredRam = ns.getScriptRam(script, "home");
          let available = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");

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

          if (available >= requiredRam) {
            const pid = ns.exec(script, "home", 1, ...args);
            if (pid > 0) {
              ns.toast(`Buying ${cmd.selectedAugs.length} selected augments...`, "success", 2000);
            } else {
              ns.toast("Failed to launch purchase-augments", "error", 3000);
            }
          } else {
            ns.toast(
              `Not enough RAM for purchase-augments (need ${ns.formatRam(requiredRam)}, have ${ns.formatRam(available)})`,
              "error", 4000
            );
          }
        }
      }
      break;
    case "restart-gang-daemon":
      {
        const currentGangPid = cachedData.pids.gang;
        if (currentGangPid > 0) {
          ns.kill(currentGangPid);
          cachedData.pids.gang = 0;
        }
        const gangArgs: string[] = [];
        if (cmd.gangStrategy) gangArgs.push("--strategy", cmd.gangStrategy);
        const gangPid = ns.exec("daemons/gang.js", "home", 1, ...gangArgs);
        if (gangPid > 0) {
          cachedData.pids.gang = gangPid;
          ns.toast(cmd.gangStrategy ? `Gang daemon: ${cmd.gangStrategy} strategy` : "Gang daemon restarted", "success", 2000);
        } else {
          ns.toast("Failed to restart gang daemon (not enough RAM)", "error", 3000);
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

export interface TabState {
  group: number; // -1 = Overview, 0..N = index into TAB_GROUPS
  sub: number;   // index within the group's plugins
}

interface UIState {
  activeTab: TabState;
  pluginUIState: Record<ToolName, Record<string, unknown>>;
}

const uiState: UIState = {
  activeTab: { group: -1, sub: 0 },
  pluginUIState: {
    nuke: {},
    pserv: {},
    share: {},
    rep: {},
    hack: {},
    darkweb: {},
    work: {},
    faction: {},
    infiltration: {},
    gang: {},
    augments: {},
    advisor: {},
    contracts: {},
  },
};

export function getActiveTab(): TabState {
  return uiState.activeTab;
}

export function setActiveTab(tab: TabState): void {
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

// === PERSISTENT SETTINGS ===

const SETTINGS_FILE = "/data/dashboard-settings.txt";

interface DashboardSettings {
  hack: {
    strategy: string;
    maxBatches: number;
    homeReserve: number;
  };
  share: {
    targetPercent: number;
  };
  infiltration?: {
    rewardMode: string;
  };
}

/**
 * Save current hack/share settings to a file for persistence across restarts.
 */
export function saveDashboardSettings(ns: NS): void {
  const settings: DashboardSettings = {
    hack: {
      strategy: (uiState.pluginUIState.hack.strategy as string) || "money",
      maxBatches: (uiState.pluginUIState.hack.maxBatches as number) || 1,
      homeReserve: (uiState.pluginUIState.hack.homeReserve as number) || 640,
    },
    share: {
      targetPercent: (uiState.pluginUIState.share.targetPercent as number) || 0,
    },
    infiltration: {
      rewardMode: (uiState.pluginUIState.infiltration.rewardMode as string) || "rep",
    },
  };
  ns.write(SETTINGS_FILE, JSON.stringify(settings), "w");
}

/**
 * Load saved settings from file and populate pluginUIState.
 */
export function loadDashboardSettings(ns: NS): void {
  if (!ns.fileExists(SETTINGS_FILE)) return;

  try {
    const raw = ns.read(SETTINGS_FILE);
    const settings = JSON.parse(raw) as DashboardSettings;

    if (settings.hack) {
      if (settings.hack.strategy) uiState.pluginUIState.hack.strategy = settings.hack.strategy;
      if (settings.hack.maxBatches !== undefined) uiState.pluginUIState.hack.maxBatches = settings.hack.maxBatches;
      if (settings.hack.homeReserve !== undefined) uiState.pluginUIState.hack.homeReserve = settings.hack.homeReserve;
    }
    if (settings.share) {
      if (settings.share.targetPercent !== undefined) uiState.pluginUIState.share.targetPercent = settings.share.targetPercent;
    }
    if (settings.infiltration) {
      if (settings.infiltration.rewardMode) uiState.pluginUIState.infiltration.rewardMode = settings.infiltration.rewardMode;
    }
  } catch {
    // Invalid settings file, ignore
  }
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
  factionStatus: FactionStatus | null;
  factionError: string | null;
  fleetAllocation: FleetAllocation | null;
  infiltrationStatus: InfiltrationStatus | null;
  gangStatus: GangStatus | null;
  augmentsStatus: AugmentsStatus | null;
  advisorStatus: AdvisorStatus | null;
  contractsStatus: ContractsStatus | null;
}

const cachedData: CachedData = {
  pids: { nuke: 0, pserv: 0, share: 0, rep: 0, hack: 0, darkweb: 0, work: 0, faction: 0, infiltration: 0, gang: 0, augments: 0, advisor: 0, contracts: 0 },
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
  factionStatus: null,
  factionError: null,
  fleetAllocation: null,
  infiltrationStatus: null,
  gangStatus: null,
  augmentsStatus: null,
  advisorStatus: null,
  contractsStatus: null,
};

// === PORT-BASED STATUS READING ===

/** Port data older than this is considered stale (e.g. from a previous session). */
const STALE_THRESHOLD_MS = 30_000;

/**
 * Read all status ports and update cached data.
 * Replaces the old updatePluginsIfNeeded() which called controller functions.
 * This is extremely lightweight — just port.peek() + JSON.parse.
 * Uses staleness threshold to auto-expire data from previous sessions.
 */
export function readStatusPorts(ns: NS): void {
  cachedData.nukeStatus = peekStatus<NukeStatus>(ns, STATUS_PORTS.nuke, STALE_THRESHOLD_MS);
  cachedData.hackStatus = peekStatus<HackStatus>(ns, STATUS_PORTS.hack, STALE_THRESHOLD_MS);

  // Sync UI state from daemon's published status (reflects auto-mode changes)
  if (cachedData.hackStatus) {
    const hs = cachedData.hackStatus;
    if (hs.maxBatches !== undefined) {
      uiState.pluginUIState.hack.maxBatches = hs.maxBatches;
    }
    if (hs.strategy) {
      uiState.pluginUIState.hack.strategy = hs.strategy;
    }
  }

  cachedData.pservStatus = peekStatus<PservStatus>(ns, STATUS_PORTS.pserv, STALE_THRESHOLD_MS);
  cachedData.shareStatus = peekStatus<ShareStatus>(ns, STATUS_PORTS.share, STALE_THRESHOLD_MS);

  const rep = peekStatus<RepStatus>(ns, STATUS_PORTS.rep, STALE_THRESHOLD_MS);
  cachedData.repStatus = rep;
  if (rep) cachedData.repError = null;

  const work = peekStatus<WorkStatus>(ns, STATUS_PORTS.work, STALE_THRESHOLD_MS);
  cachedData.workStatus = work;
  if (work) cachedData.workError = null;

  const darkweb = peekStatus<DarkwebStatus>(ns, STATUS_PORTS.darkweb, STALE_THRESHOLD_MS);
  cachedData.darkwebStatus = darkweb;
  if (darkweb) cachedData.darkwebError = null;

  cachedData.bitnodeStatus = peekStatus<BitnodeStatus>(ns, STATUS_PORTS.bitnode, STALE_THRESHOLD_MS);

  const faction = peekStatus<FactionStatus>(ns, STATUS_PORTS.faction, STALE_THRESHOLD_MS);
  cachedData.factionStatus = faction;
  if (faction) cachedData.factionError = null;

  cachedData.fleetAllocation = peekStatus<FleetAllocation>(ns, STATUS_PORTS.fleet, STALE_THRESHOLD_MS);

  cachedData.infiltrationStatus = peekStatus<InfiltrationStatus>(ns, STATUS_PORTS.infiltration, STALE_THRESHOLD_MS);

  cachedData.gangStatus = peekStatus<GangStatus>(ns, STATUS_PORTS.gang, STALE_THRESHOLD_MS);

  cachedData.augmentsStatus = peekStatus<AugmentsStatus>(ns, STATUS_PORTS.augments, STALE_THRESHOLD_MS);

  cachedData.advisorStatus = peekStatus<AdvisorStatus>(ns, STATUS_PORTS.advisor, STALE_THRESHOLD_MS);

  cachedData.contractsStatus = peekStatus<ContractsStatus>(ns, STATUS_PORTS.contracts, STALE_THRESHOLD_MS);
}

// === TOOL CONTROL ===

/** Clear cached status for a tool (used when stopping or when daemon dies). */
function clearToolStatus(tool: ToolName): void {
  switch (tool) {
    case "nuke":    cachedData.nukeStatus = null; break;
    case "hack":    cachedData.hackStatus = null; break;
    case "pserv":   cachedData.pservStatus = null; break;
    case "share":   cachedData.shareStatus = null; break;
    case "rep":     cachedData.repStatus = null; cachedData.repError = null; break;
    case "work":    cachedData.workStatus = null; cachedData.workError = null; break;
    case "darkweb": cachedData.darkwebStatus = null; cachedData.darkwebError = null; break;
    case "faction": cachedData.factionStatus = null; cachedData.factionError = null; break;
    case "infiltration": cachedData.infiltrationStatus = null; break;
    case "gang": cachedData.gangStatus = null; break;
    case "augments": cachedData.augmentsStatus = null; break;
    case "advisor": cachedData.advisorStatus = null; break;
    case "contracts": cachedData.contractsStatus = null; break;
  }
}

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

  let pid: number;
  if (tool === "hack") {
    const hackState = uiState.pluginUIState.hack;
    const strategy = (hackState.strategy as string) || "money";
    const batches = (hackState.maxBatches as number) || 1;
    const reserve = (hackState.homeReserve as number) || 640;
    const args = ["--strategy", strategy, "--max-batches", String(batches), "--home-reserve", String(reserve)];
    pid = ns.exec(script, "home", 1, ...args);
  } else if (tool === "share") {
    const shareState = uiState.pluginUIState.share;
    const targetPercent = (shareState.targetPercent as number) || 0;
    const args: string[] = [];
    if (targetPercent > 0) {
      args.push("--target-percent", String(targetPercent));
    }
    pid = ns.exec(script, "home", 1, ...args);
  } else if (tool === "gang") {
    const gangState = uiState.pluginUIState.gang;
    const strategy = (gangState.strategy as string) || "";
    const args: string[] = [];
    if (strategy) args.push("--strategy", strategy);
    pid = ns.exec(script, "home", 1, ...args);
  } else {
    pid = ns.exec(script, "home");
  }

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
    clearToolStatus(tool);
    ns.toast(`Stopped ${tool}`, "warning", 2000);
  }
}

export function getFleetAllocation(): FleetAllocation | null {
  return cachedData.fleetAllocation;
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
      clearToolStatus(tool);
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
    factionStatus: cachedData.factionStatus,
    factionError: cachedData.factionError,
    fleetAllocation: cachedData.fleetAllocation,
    infiltrationStatus: cachedData.infiltrationStatus,
    gangStatus: cachedData.gangStatus,
    augmentsStatus: cachedData.augmentsStatus,
    advisorStatus: cachedData.advisorStatus,
    contractsStatus: cachedData.contractsStatus,
  };
}
