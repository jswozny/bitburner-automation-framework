/**
 * Distributed Multi-Target Hacker
 *
 * Intelligently spreads your RAM across multiple targets simultaneously,
 * calculating optimal thread counts per target to maximize income.
 *
 * Run: run hack/distributed.js
 *      run hack/distributed.js --one-shot
 *      run hack/distributed.js --interval 500 --max-targets 50
 */
import { NS, Server } from "@ns";
import { COLORS, getAllServers, determineAction, HackAction } from "/lib/utils";

// === TYPES ===

export interface DistributedConfig {
  oneShot: boolean;
  interval: number;
  homeReserve: number;
  maxTargets: number;
  moneyThreshold: number;
  securityBuffer: number;
  hackPercent: number;
}

export interface ServerInfo {
  hostname: string;
  maxRam: number;
  availableRam: number;
}

export interface TargetInfo {
  hostname: string;
  value: number;
  moneyMax: number;
}

export interface TargetAssignment {
  hostname: string;
  action: HackAction;
  optimalThreads: number;
  script: string;
  scriptRam: number;
  value: number;
  assignedThreads: number;
  assignedServers: { hostname: string; threads: number }[];
}

export interface DistributedResult {
  assignments: TargetAssignment[];
  totalRam: number;
  serverCount: number;
  totalThreads: number;
  activeTargets: number;
  shortestWait: number;
  longestWait: number;
}

// === WORKER SCRIPTS ===

export const SCRIPTS = {
  hack: "/workers/hack.js",
  grow: "/workers/grow.js",
  weaken: "/workers/weaken.js",
} as const;

// === CORE LOGIC ===

/**
 * Get all servers with available RAM, sorted by RAM descending
 */
export function getUsableServers(ns: NS, homeReserve: number): ServerInfo[] {
  const servers: ServerInfo[] = [];

  for (const hostname of getAllServers(ns)) {
    const server = ns.getServer(hostname);
    if (!server.hasAdminRights) continue;
    if (server.maxRam === 0) continue;

    const reserved = hostname === "home" ? homeReserve : 0;
    const available = server.maxRam - server.ramUsed - reserved;

    if (available > 0) {
      servers.push({
        hostname,
        maxRam: server.maxRam,
        availableRam: available,
      });
    }
  }

  return servers.sort((a, b) => b.availableRam - a.availableRam);
}

/**
 * Get ranked list of hackable targets
 */
export function getTargets(ns: NS, maxTargets: number): TargetInfo[] {
  const player = ns.getPlayer();
  const targets: TargetInfo[] = [];

  for (const hostname of getAllServers(ns)) {
    const server = ns.getServer(hostname);

    if (!server.hasAdminRights) continue;
    if ((server.requiredHackingSkill ?? 0) > player.skills.hacking) continue;
    if ((server.moneyMax ?? 0) === 0) continue;
    if (hostname.startsWith("pserv-") || hostname === "home") continue;

    const hackTime = ns.getHackTime(hostname);
    const moneyMax = server.moneyMax ?? 0;
    const minDifficulty = server.minDifficulty ?? 1;
    const value = moneyMax / hackTime / minDifficulty;

    targets.push({ hostname, value, moneyMax });
  }

  return targets.sort((a, b) => b.value - a.value).slice(0, maxTargets);
}

/**
 * Calculate optimal threads for an action on a target
 */
export function calculateOptimalThreads(
  ns: NS,
  hostname: string,
  action: HackAction,
  hackPercent: number
): number {
  const server = ns.getServer(hostname);

  if (action === "weaken") {
    const hackDifficulty = server.hackDifficulty ?? 0;
    const minDifficulty = server.minDifficulty ?? 0;
    const needed = (hackDifficulty - minDifficulty) / 0.05;
    return Math.ceil(needed);
  } else if (action === "grow") {
    const moneyMax = server.moneyMax ?? 0;
    const moneyAvailable = server.moneyAvailable ?? 0;
    const growthNeeded = moneyMax / Math.max(moneyAvailable, 1);
    return Math.ceil(ns.growthAnalyze(hostname, growthNeeded));
  } else {
    const hackAnalysis = ns.hackAnalyze(hostname);
    if (hackAnalysis === 0) return 1;
    return Math.max(1, Math.floor(hackPercent / hackAnalysis));
  }
}

/**
 * Create assignments for all targets
 */
export function createAssignments(
  ns: NS,
  targets: TargetInfo[],
  config: Pick<DistributedConfig, "moneyThreshold" | "securityBuffer" | "hackPercent">
): TargetAssignment[] {
  const assignments: TargetAssignment[] = [];

  for (const target of targets) {
    const server = ns.getServer(target.hostname);
    const action = determineAction(server, config.moneyThreshold, config.securityBuffer);
    const optimalThreads = calculateOptimalThreads(ns, target.hostname, action, config.hackPercent);
    const script = SCRIPTS[action];

    assignments.push({
      hostname: target.hostname,
      action,
      optimalThreads,
      script,
      scriptRam: ns.getScriptRam(script),
      value: target.value,
      assignedThreads: 0,
      assignedServers: [],
    });
  }

  return assignments;
}

/**
 * Distribute servers to targets based on priority
 */
export function assignServersToTargets(
  servers: ServerInfo[],
  assignments: TargetAssignment[]
): void {
  let serverIndex = 0;
  let allSaturated = false;

  while (serverIndex < servers.length && !allSaturated) {
    allSaturated = true;

    for (const assignment of assignments) {
      if (serverIndex >= servers.length) break;

      if (assignment.assignedThreads >= assignment.optimalThreads) continue;

      allSaturated = false;
      const srv = servers[serverIndex];
      const threadsCanRun = Math.floor(srv.availableRam / assignment.scriptRam);

      if (threadsCanRun > 0) {
        const threadsToAssign = Math.min(
          threadsCanRun,
          assignment.optimalThreads - assignment.assignedThreads
        );

        assignment.assignedServers.push({
          hostname: srv.hostname,
          threads: threadsToAssign,
        });
        assignment.assignedThreads += threadsToAssign;

        srv.availableRam -= threadsToAssign * assignment.scriptRam;

        if (srv.availableRam < assignment.scriptRam) {
          serverIndex++;
        }
      }
    }

    // Prevent locking up if trying to assign to full server
    const srv = servers[serverIndex];
    const unsaturated = assignments.filter((a) => a.assignedThreads < a.optimalThreads);
    if (unsaturated.length > 0 && srv) {
      const smallestRam = Math.min(...unsaturated.map((a) => a.scriptRam));
      if (srv.availableRam < smallestRam) {
        serverIndex++;
      }
    }
  }

  // Overflow remaining RAM to best target
  if (serverIndex < servers.length && assignments.length > 0) {
    const bestTarget = assignments[0];
    while (serverIndex < servers.length) {
      const srv = servers[serverIndex];
      const threadsCanRun = Math.floor(srv.availableRam / bestTarget.scriptRam);

      if (threadsCanRun > 0) {
        bestTarget.assignedServers.push({
          hostname: srv.hostname,
          threads: threadsCanRun,
        });
        bestTarget.assignedThreads += threadsCanRun;
      }
      serverIndex++;
    }
  }
}

/**
 * Deploy worker scripts to all servers
 */
export async function deployWorkers(ns: NS, servers: ServerInfo[]): Promise<void> {
  const workers = Object.values(SCRIPTS);
  for (const server of servers) {
    if (
      !(
        ns.fileExists(SCRIPTS.hack, server.hostname) &&
        ns.fileExists(SCRIPTS.weaken, server.hostname) &&
        ns.fileExists(SCRIPTS.grow, server.hostname)
      )
    ) {
      await ns.scp(workers, server.hostname, "home");
    }
  }
}

/**
 * Execute all assignments and return wait times
 */
export function executeAssignments(
  ns: NS,
  assignments: TargetAssignment[]
): { shortest: number; longest: number } {
  let longestWait = 0;
  let shortestWait = Number.MAX_SAFE_INTEGER;

  for (const assignment of assignments) {
    if (assignment.assignedThreads === 0) continue;

    for (const srv of assignment.assignedServers) {
      ns.exec(assignment.script, srv.hostname, srv.threads, assignment.hostname, 0, Date.now());
    }

    let waitTime: number;
    if (assignment.action === "weaken") waitTime = ns.getWeakenTime(assignment.hostname);
    else if (assignment.action === "grow") waitTime = ns.getGrowTime(assignment.hostname);
    else waitTime = ns.getHackTime(assignment.hostname);

    longestWait = Math.max(longestWait, waitTime);
    shortestWait = Math.min(shortestWait, waitTime);
  }

  return {
    shortest: shortestWait === Number.MAX_SAFE_INTEGER ? 0 : shortestWait,
    longest: longestWait,
  };
}

/**
 * Run one distributed hacking cycle
 */
export async function runDistributedCycle(
  ns: NS,
  config: DistributedConfig
): Promise<DistributedResult> {
  const servers = getUsableServers(ns, config.homeReserve);
  const totalRam = servers.reduce((sum, s) => sum + s.availableRam, 0);

  await deployWorkers(ns, servers);

  const targets = getTargets(ns, config.maxTargets);

  const assignments = createAssignments(ns, targets, config);
  assignServersToTargets(servers, assignments);

  const waitTimes = executeAssignments(ns, assignments);

  const totalThreads = assignments.reduce((sum, a) => sum + a.assignedThreads, 0);
  const activeTargets = assignments.filter((a) => a.assignedThreads > 0).length;

  return {
    assignments,
    totalRam,
    serverCount: servers.length,
    totalThreads,
    activeTargets,
    shortestWait: waitTimes.shortest,
    longestWait: waitTimes.longest,
  };
}

// === DISPLAY ===

/**
 * Format distributed cycle result for display
 */
export function formatDistributedStatus(ns: NS, result: DistributedResult): string[] {
  const C = COLORS;
  const lines: string[] = [];
  const actionColors: Record<HackAction, string> = {
    hack: C.green,
    grow: C.yellow,
    weaken: C.blue,
  };

  lines.push(`${C.cyan}════════════════════════════════════════${C.reset}`);
  lines.push(`${C.cyan}  DISTRIBUTED HACKER - ${new Date().toLocaleTimeString()}${C.reset}`);
  lines.push(`${C.cyan}════════════════════════════════════════${C.reset}`);
  lines.push(
    `${C.white}Total RAM: ${ns.formatRam(result.totalRam)} across ${result.serverCount} servers${C.reset}`
  );
  lines.push("");
  lines.push(`${C.white}Target Assignments:${C.reset}`);

  for (const assignment of result.assignments) {
    if (assignment.assignedThreads === 0) continue;

    const color = actionColors[assignment.action];
    const server = ns.getServer(assignment.hostname);
    const money = ns.formatNumber(server.moneyAvailable ?? 0);
    const maxMoney = ns.formatNumber(server.moneyMax ?? 0);
    const sec = (server.hackDifficulty ?? 0).toFixed(1);
    const minSec = (server.minDifficulty ?? 0).toFixed(1);
    const saturated = assignment.assignedThreads >= assignment.optimalThreads;
    const satMark = saturated ? `${C.green}✓${C.reset}` : `${C.yellow}~${C.reset}`;

    lines.push(
      `  ${color}${assignment.action.toUpperCase().padEnd(6)}${C.reset} → ${C.cyan}${assignment.hostname.padEnd(15)}${C.reset} | ${satMark} ${assignment.assignedThreads.toLocaleString().padStart(10)} threads | $${money}/${maxMoney} | Sec ${sec}/${minSec}`
    );
  }

  lines.push("");
  lines.push(
    `${C.magenta}Summary: ${result.totalThreads.toLocaleString()} threads across ${result.activeTargets} targets${C.reset}`
  );

  return lines;
}

// === RUNNER ===

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ["one-shot", false],
    ["interval", 200],
    ["home-reserve", 32],
    ["max-targets", 100],
  ]) as {
    "one-shot": boolean;
    interval: number;
    "home-reserve": number;
    "max-targets": number;
    _: string[];
  };

  const config: DistributedConfig = {
    oneShot: flags["one-shot"],
    interval: flags.interval,
    homeReserve: flags["home-reserve"],
    maxTargets: flags["max-targets"],
    moneyThreshold: 0.8,
    securityBuffer: 5,
    hackPercent: 0.25,
  };

  ns.disableLog("ALL");

  if (!config.oneShot) {
    ns.ui.openTail();
  }

  do {
    ns.clearLog();

    const result = await runDistributedCycle(ns, config);

    if (result.assignments.length === 0) {
      ns.print(`${COLORS.red}ERROR: No valid targets found!${COLORS.reset}`);
      if (!config.oneShot) {
        await ns.sleep(5000);
      }
      continue;
    }

    const lines = formatDistributedStatus(ns, result);
    for (const line of lines) {
      ns.print(line);
    }

    if (!config.oneShot) {
      const waitTime = Math.max(Math.min(result.shortestWait, 30000), 1000);
      ns.print(`${COLORS.white}Waiting ${ns.tFormat(waitTime)}...${COLORS.reset}`);
      await ns.sleep(config.interval + waitTime);
    }
  } while (!config.oneShot);
}
