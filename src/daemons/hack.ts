/**
 * Hack Daemon
 *
 * Long-running daemon that wraps the distributed hacking engine and publishes
 * HackStatus to the status port for dashboard consumption.
 *
 * Each loop:
 *   1. Runs a distributed hacking cycle (deploy workers, assign targets)
 *   2. Scans all running worker processes to build real-time status
 *   3. Publishes HackStatus to STATUS_PORTS.hack
 *   4. Prints formatted status to the script log
 *   5. Waits based on shortest worker completion time
 *
 * Usage:
 *   run daemons/hack.js
 *   run daemons/hack.js --one-shot
 *   run daemons/hack.js --interval 500 --max-targets 50
 */
import { NS } from "@ns";
import {
  runDistributedCycle,
  formatDistributedStatus,
  getUsableServers,
  getTargets,
  DistributedConfig,
  SCRIPTS,
} from "/controllers/hack";
import { publishStatus } from "/lib/ports";
import { STATUS_PORTS, HackStatus, TargetAssignment as FormattedTarget } from "/types/ports";
import { getAllServers, HackAction } from "/lib/utils";

// === CONFIG ===

const DEFAULT_CONFIG: Pick<
  DistributedConfig,
  "moneyThreshold" | "securityBuffer" | "hackPercent"
> = {
  moneyThreshold: 0.8,
  securityBuffer: 5,
  hackPercent: 0.25,
};

// === TIME FORMATTING ===

/**
 * Format milliseconds as condensed MM:SS or HH:MM:SS
 */
function formatTimeCondensed(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// === RUNNING JOBS SCANNING ===

interface RunningJobInfo {
  hack: number;
  grow: number;
  weaken: number;
  earliestCompletion: number | null;
}

/**
 * Scan all servers for running worker scripts and aggregate thread counts
 * per target, along with the earliest expected completion time.
 */
function getRunningJobs(ns: NS): Record<string, RunningJobInfo> {
  const jobs: Record<string, RunningJobInfo> = {};

  for (const hostname of getAllServers(ns)) {
    for (const proc of ns.ps(hostname)) {
      if (!proc.filename.includes("workers/")) continue;

      const target = proc.args[0] as string;
      if (!target) continue;

      const action = proc.filename.split("/").pop()?.replace(".js", "") as
        | "hack"
        | "grow"
        | "weaken";
      if (!["hack", "grow", "weaken"].includes(action)) continue;

      const delay = (proc.args[1] as number) || 0;
      const launchTime = proc.args[2] as number;

      if (!jobs[target]) {
        jobs[target] = { hack: 0, grow: 0, weaken: 0, earliestCompletion: null };
      }
      jobs[target][action] += proc.threads;

      // Calculate completion time from launch timestamp + delay + duration
      if (launchTime) {
        let duration: number;
        if (action === "hack") duration = ns.getHackTime(target);
        else if (action === "grow") duration = ns.getGrowTime(target);
        else duration = ns.getWeakenTime(target);

        const completionTime = launchTime + delay + duration;
        const currentEarliest = jobs[target].earliestCompletion;
        if (currentEarliest === null || completionTime < currentEarliest) {
          jobs[target].earliestCompletion = completionTime;
        }
      }
    }
  }

  return jobs;
}

// === EXPECTED MONEY CALCULATION ===

/**
 * Calculate expected money from hack threads on a target.
 * Uses Formulas API when available, falls back to standard API.
 */
function calcExpectedMoney(ns: NS, target: string, hackThreads: number): number {
  if (hackThreads <= 0) return 0;

  const server = ns.getServer(target);
  const moneyAvailable = server.moneyAvailable ?? 0;

  if (ns.fileExists("Formulas.exe", "home")) {
    const player = ns.getPlayer();
    const hackPercent = ns.formulas.hacking.hackPercent(server, player);
    const hackChance = ns.formulas.hacking.hackChance(server, player);
    return moneyAvailable * Math.min(hackPercent * hackThreads, 1) * hackChance;
  }

  const hackPercent = ns.hackAnalyze(target) * hackThreads;
  const hackChance = ns.hackAnalyzeChance(target);
  return moneyAvailable * Math.min(hackPercent, 1) * hackChance;
}

// === DISPLAY ACTION DETERMINATION ===

/**
 * Determine the display action based on running jobs or server state.
 * If jobs are running, use the dominant action; otherwise infer from server state.
 */
function determineDisplayAction(
  jobs: { hack: number; grow: number; weaken: number },
  server: {
    hackDifficulty?: number;
    minDifficulty?: number;
    moneyAvailable?: number;
    moneyMax?: number;
  },
): HackAction {
  const totalJobs = jobs.hack + jobs.grow + jobs.weaken;
  if (totalJobs > 0) {
    if (jobs.hack >= jobs.grow && jobs.hack >= jobs.weaken) return "hack";
    if (jobs.grow >= jobs.weaken) return "grow";
    return "weaken";
  }

  const securityThresh = (server.minDifficulty ?? 0) + DEFAULT_CONFIG.securityBuffer;
  const moneyThresh = (server.moneyMax ?? 0) * DEFAULT_CONFIG.moneyThreshold;

  if ((server.hackDifficulty ?? 0) > securityThresh) return "weaken";
  if ((server.moneyAvailable ?? 0) < moneyThresh) return "grow";
  return "hack";
}

// === STATUS COMPUTATION ===

/**
 * Build the full HackStatus object by scanning running workers and
 * computing per-target metrics for the dashboard.
 */
function computeHackStatus(ns: NS, homeReserve: number, maxTargets: number): HackStatus | null {
  const player = ns.getPlayer();
  const playerHacking = player.skills.hacking;

  const servers = getUsableServers(ns, homeReserve);
  const totalRam = servers.reduce((sum, s) => sum + s.availableRam, 0);

  const targets = getTargets(ns, maxTargets);
  if (targets.length === 0) return null;

  const runningJobs = getRunningJobs(ns);

  // Track servers needing higher hacking level
  let needHigherLevel: { count: number; nextLevel: number } | null = null;
  let lowestRequiredAbovePlayer = Number.MAX_SAFE_INTEGER;
  let countNeedHigher = 0;

  for (const hostname of getAllServers(ns)) {
    const server = ns.getServer(hostname);
    if ((server.moneyMax ?? 0) === 0) continue;
    if (hostname.startsWith("pserv-") || hostname === "home") continue;

    const required = server.requiredHackingSkill ?? 0;
    if (required > playerHacking) {
      countNeedHigher++;
      if (required < lowestRequiredAbovePlayer) {
        lowestRequiredAbovePlayer = required;
      }
    }
  }

  if (countNeedHigher > 0 && lowestRequiredAbovePlayer < Number.MAX_SAFE_INTEGER) {
    needHigherLevel = { count: countNeedHigher, nextLevel: lowestRequiredAbovePlayer };
  }

  // Aggregate counters
  let hackingCount = 0;
  let growingCount = 0;
  let weakeningCount = 0;
  let totalExpectedMoney = 0;
  let totalThreadsCount = 0;
  let shortestWait = Number.MAX_SAFE_INTEGER;
  let longestWait = 0;

  const formattedTargets: FormattedTarget[] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const jobs = runningJobs[target.hostname] || {
      hack: 0,
      grow: 0,
      weaken: 0,
      earliestCompletion: null,
    };
    const server = ns.getServer(target.hostname);

    const totalThreads = jobs.hack + jobs.grow + jobs.weaken;
    totalThreadsCount += totalThreads;

    const action = determineDisplayAction(jobs, server);

    // Count targets by dominant action
    if (totalThreads > 0) {
      if (jobs.hack >= jobs.grow && jobs.hack >= jobs.weaken) hackingCount++;
      else if (jobs.grow >= jobs.weaken) growingCount++;
      else weakeningCount++;
    }

    // Expected money from hack threads
    const expectedMoney = calcExpectedMoney(ns, target.hostname, jobs.hack);
    totalExpectedMoney += expectedMoney;

    // Wait time based on current action
    let waitTime: number;
    if (action === "weaken") waitTime = ns.getWeakenTime(target.hostname);
    else if (action === "grow") waitTime = ns.getGrowTime(target.hostname);
    else waitTime = ns.getHackTime(target.hostname);

    if (totalThreads > 0) {
      shortestWait = Math.min(shortestWait, waitTime);
      longestWait = Math.max(longestWait, waitTime);
    }

    // Completion ETA from tracked launch times
    let completionEta: string | null = null;
    if (jobs.earliestCompletion !== null) {
      const msRemaining = jobs.earliestCompletion - Date.now();
      completionEta = msRemaining > 0 ? formatTimeCondensed(msRemaining) : "now";
    }

    // Server money and security state
    const moneyAvailable = server.moneyAvailable ?? 0;
    const moneyMax = server.moneyMax ?? 1;
    const moneyPercent = (moneyAvailable / moneyMax) * 100;

    const hackDifficulty = server.hackDifficulty ?? 0;
    const minDifficulty = server.minDifficulty ?? 0;
    const securityDelta = hackDifficulty - minDifficulty;

    formattedTargets.push({
      rank: i + 1,
      hostname: target.hostname,
      action,
      assignedThreads: totalThreads,
      optimalThreads: 0,
      threadsSaturated: totalThreads > 0,
      moneyPercent,
      moneyDisplay: `${ns.formatNumber(moneyAvailable)} / ${ns.formatNumber(moneyMax)}`,
      securityDelta: securityDelta > 0 ? `+${securityDelta.toFixed(1)}` : "0",
      securityClean: securityDelta <= 2,
      eta: formatTimeCondensed(waitTime),
      expectedMoney,
      expectedMoneyFormatted: expectedMoney > 0 ? `$${ns.formatNumber(expectedMoney)}` : "-",
      totalThreads,
      completionEta,
      hackThreads: jobs.hack,
      growThreads: jobs.grow,
      weakenThreads: jobs.weaken,
    });
  }

  const activeTargets = formattedTargets.filter((t) => t.totalThreads > 0).length;
  const saturationPercent = targets.length > 0 ? (activeTargets / targets.length) * 100 : 0;

  return {
    totalRam: ns.formatRam(totalRam),
    serverCount: servers.length,
    totalThreads: ns.formatNumber(totalThreadsCount),
    activeTargets,
    totalTargets: targets.length,
    saturationPercent,
    shortestWait:
      shortestWait === Number.MAX_SAFE_INTEGER ? "N/A" : formatTimeCondensed(shortestWait),
    longestWait: longestWait === 0 ? "N/A" : formatTimeCondensed(longestWait),
    hackingCount,
    growingCount,
    weakeningCount,
    targets: formattedTargets,
    totalExpectedMoney,
    totalExpectedMoneyFormatted: `$${ns.formatNumber(totalExpectedMoney)}`,
    needHigherLevel,
  };
}

// === RUNNER ===

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

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
    moneyThreshold: DEFAULT_CONFIG.moneyThreshold,
    securityBuffer: DEFAULT_CONFIG.securityBuffer,
    hackPercent: DEFAULT_CONFIG.hackPercent,
  };

  do {
    ns.clearLog();

    // 1. Run the distributed hacking cycle (deploy workers, assign and exec)
    const result = await runDistributedCycle(ns, config);

    if (result.assignments.length === 0) {
      ns.print("ERROR: No valid targets found!");

      // Publish empty-ish status so dashboard knows we're alive but idle
      const emptyStatus: HackStatus = {
        totalRam: ns.formatRam(0),
        serverCount: 0,
        totalThreads: "0",
        activeTargets: 0,
        totalTargets: 0,
        saturationPercent: 0,
        shortestWait: "N/A",
        longestWait: "N/A",
        hackingCount: 0,
        growingCount: 0,
        weakeningCount: 0,
        targets: [],
        totalExpectedMoney: 0,
        totalExpectedMoneyFormatted: "$0",
        needHigherLevel: null,
      };
      publishStatus(ns, STATUS_PORTS.hack, emptyStatus);

      if (!config.oneShot) {
        await ns.sleep(5000);
      }
      continue;
    }

    // 2. Compute HackStatus from running worker processes
    const hackStatus = computeHackStatus(ns, config.homeReserve, config.maxTargets);
    if (hackStatus) {
      // 3. Publish to status port for dashboard consumption
      publishStatus(ns, STATUS_PORTS.hack, hackStatus);
    }

    // 4. Print terminal display using distributed status formatter
    const lines = formatDistributedStatus(ns, result);
    for (const line of lines) {
      ns.print(line);
    }

    // 5. Wait based on shortest completion time, clamped between 1s and 30s
    if (!config.oneShot) {
      const waitTime = Math.max(Math.min(result.shortestWait, 30000), 1000);
      ns.print(`Waiting ${ns.tFormat(waitTime)}...`);
      await ns.sleep(config.interval + waitTime);
    }
  } while (!config.oneShot);
}
