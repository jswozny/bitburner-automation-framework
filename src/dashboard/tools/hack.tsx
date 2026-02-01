/**
 * Hack Tool Plugin
 *
 * Displays distributed hacking status with target assignments, thread allocation,
 * and saturation status.
 */
import React from "lib/react";
import { NS } from "@ns";
import {
  ToolPlugin,
  FormattedHackStatus,
  FormattedTargetAssignment,
  OverviewCardProps,
  DetailPanelProps,
} from "dashboard/types";
import { styles } from "dashboard/styles";
import { ToolControl } from "dashboard/components/ToolControl";
import {
  getUsableServers,
  getTargets,
  DistributedConfig,
} from "hack/distributed";
import { getAllServers, HackAction } from "lib/utils";

// === CONFIG ===

const DEFAULT_CONFIG: Pick<DistributedConfig, "homeReserve" | "maxTargets" | "moneyThreshold" | "securityBuffer" | "hackPercent"> = {
  homeReserve: 32,
  maxTargets: 100,
  moneyThreshold: 0.8,
  securityBuffer: 5,
  hackPercent: 0.25,
};

// === ACTION COLORS ===

const ACTION_COLORS: Record<HackAction, string> = {
  hack: "#00ff00",
  grow: "#ffff00",
  weaken: "#0088ff",
};

// Maximum targets to display in the UI
const MAX_DISPLAY = 15;

// === RUNNING JOBS SCANNING ===

interface RunningJobs {
  [target: string]: {
    hack: number;
    grow: number;
    weaken: number;
    earliestCompletion: number | null;
  };
}

/**
 * Scan all servers for actually running worker scripts
 */
function getRunningJobs(ns: NS): RunningJobs {
  const jobs: RunningJobs = {};

  for (const hostname of getAllServers(ns)) {
    for (const proc of ns.ps(hostname)) {
      // Match worker scripts: workers/hack.js, workers/grow.js, workers/weaken.js
      if (!proc.filename.includes("/workers/")) continue;

      const target = proc.args[0] as string;
      if (!target) continue;

      const action = proc.filename.split("/").pop()?.replace(".js", "") as "hack" | "grow" | "weaken";
      if (!["hack", "grow", "weaken"].includes(action)) continue;

      const delay = (proc.args[1] as number) || 0;
      const launchTime = proc.args[2] as number;

      if (!jobs[target]) {
        jobs[target] = { hack: 0, grow: 0, weaken: 0, earliestCompletion: null };
      }
      jobs[target][action] += proc.threads;

      // Calculate completion time
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

/**
 * Calculate expected money from hack threads
 */
function calcExpectedMoney(ns: NS, target: string, hackThreads: number): number {
  if (hackThreads <= 0) return 0;
  const server = ns.getServer(target);
  const hackPercent = ns.hackAnalyze(target) * hackThreads;
  const hackChance = ns.hackAnalyzeChance(target);
  return (server.moneyAvailable ?? 0) * Math.min(hackPercent, 1) * hackChance;
}

/**
 * Determine the display action based on running jobs or server state
 */
function determineDisplayAction(
  jobs: { hack: number; grow: number; weaken: number },
  server: { hackDifficulty?: number; minDifficulty?: number; moneyAvailable?: number; moneyMax?: number }
): HackAction {
  // If there are running jobs, show the dominant action
  const totalJobs = jobs.hack + jobs.grow + jobs.weaken;
  if (totalJobs > 0) {
    if (jobs.hack >= jobs.grow && jobs.hack >= jobs.weaken) return "hack";
    if (jobs.grow >= jobs.weaken) return "grow";
    return "weaken";
  }

  // Otherwise, determine from server state using inline logic
  const securityThresh = (server.minDifficulty ?? 0) + DEFAULT_CONFIG.securityBuffer;
  const moneyThresh = (server.moneyMax ?? 0) * DEFAULT_CONFIG.moneyThreshold;

  if ((server.hackDifficulty ?? 0) > securityThresh) {
    return "weaken";
  } else if ((server.moneyAvailable ?? 0) < moneyThresh) {
    return "grow";
  } else {
    return "hack";
  }
}

// === STATUS FORMATTING ===

function formatHackStatus(ns: NS): FormattedHackStatus | null {
  try {
    const player = ns.getPlayer();
    const playerHacking = player.skills.hacking;

    // Get all servers with available RAM
    const servers = getUsableServers(ns, DEFAULT_CONFIG.homeReserve);
    const totalRam = servers.reduce((sum, s) => sum + s.availableRam, 0);

    // Get all potential targets sorted by value
    const targets = getTargets(ns, DEFAULT_CONFIG.maxTargets);
    if (targets.length === 0) {
      return null;
    }

    // Get actual running jobs from ps()
    const runningJobs = getRunningJobs(ns);

    // Track servers needing higher level
    let needHigherLevel: { count: number; nextLevel: number } | null = null;
    let lowestRequiredAbovePlayer = Number.MAX_SAFE_INTEGER;
    let countNeedHigher = 0;

    // Scan all servers for ones we can't hack yet
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

    // Count by action type and calculate totals
    let hackingCount = 0;
    let growingCount = 0;
    let weakeningCount = 0;
    let totalExpectedMoney = 0;
    let totalThreadsCount = 0;

    // Calculate wait times
    let shortestWait = Number.MAX_SAFE_INTEGER;
    let longestWait = 0;

    const formattedTargets: FormattedTargetAssignment[] = [];

    // Show top targets by value, with their running job info
    const displayCount = Math.min(targets.length, MAX_DISPLAY);
    for (let i = 0; i < displayCount; i++) {
      const target = targets[i];
      const jobs = runningJobs[target.hostname] || { hack: 0, grow: 0, weaken: 0, earliestCompletion: null };
      const server = ns.getServer(target.hostname);

      const totalThreads = jobs.hack + jobs.grow + jobs.weaken;
      totalThreadsCount += totalThreads;

      // Determine action from actual jobs, or from server state
      const action = determineDisplayAction(jobs, server);

      // Count targets with running jobs by dominant action
      if (totalThreads > 0) {
        if (jobs.hack >= jobs.grow && jobs.hack >= jobs.weaken) hackingCount++;
        else if (jobs.grow >= jobs.weaken) growingCount++;
        else weakeningCount++;
      }

      // Calculate expected money for targets with hack threads
      const expectedMoney = calcExpectedMoney(ns, target.hostname, jobs.hack);
      totalExpectedMoney += expectedMoney;

      // Get wait time based on action
      let waitTime: number;
      if (action === "weaken") waitTime = ns.getWeakenTime(target.hostname);
      else if (action === "grow") waitTime = ns.getGrowTime(target.hostname);
      else waitTime = ns.getHackTime(target.hostname);

      if (totalThreads > 0) {
        shortestWait = Math.min(shortestWait, waitTime);
        longestWait = Math.max(longestWait, waitTime);
      }

      // Calculate completion ETA
      let completionEta: string | null = null;
      if (jobs.earliestCompletion !== null) {
        const msRemaining = jobs.earliestCompletion - Date.now();
        if (msRemaining > 0) {
          completionEta = ns.tFormat(msRemaining);
        } else {
          completionEta = "now";
        }
      }

      // Get server state
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
        optimalThreads: 0, // Not computing optimal anymore since we're showing actual
        threadsSaturated: totalThreads > 0,
        moneyPercent,
        moneyDisplay: `${ns.formatNumber(moneyAvailable)} / ${ns.formatNumber(moneyMax)}`,
        securityDelta: securityDelta > 0 ? `+${securityDelta.toFixed(1)}` : "0",
        securityClean: securityDelta <= 2,
        eta: ns.tFormat(waitTime),
        expectedMoney,
        expectedMoneyFormatted: expectedMoney > 0 ? `$${ns.formatNumber(expectedMoney)}` : "-",
        totalThreads,
        completionEta,
      });
    }

    // Count active targets (those with running jobs)
    const activeTargets = formattedTargets.filter(t => t.totalThreads > 0).length;

    // Calculate saturation (targets with jobs / display count)
    const saturationPercent = displayCount > 0 ? (activeTargets / displayCount) * 100 : 0;

    return {
      totalRam: ns.formatRam(totalRam),
      serverCount: servers.length,
      totalThreads: ns.formatNumber(totalThreadsCount),
      activeTargets,
      totalTargets: targets.length,
      saturationPercent,
      shortestWait: shortestWait === Number.MAX_SAFE_INTEGER ? "N/A" : ns.tFormat(shortestWait),
      longestWait: longestWait === 0 ? "N/A" : ns.tFormat(longestWait),
      hackingCount,
      growingCount,
      weakeningCount,
      targets: formattedTargets,
      totalExpectedMoney,
      totalExpectedMoneyFormatted: `$${ns.formatNumber(totalExpectedMoney)}`,
      needHigherLevel,
    };
  } catch {
    return null;
  }
}

// === COMPONENTS ===

function HackOverviewCard({ status, running, toolId }: OverviewCardProps<FormattedHackStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>HACK</span>
        <ToolControl tool={toolId} running={running} />
      </div>
      {status ? (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Targets</span>
            <span style={styles.statValue}>{status.activeTargets}/{status.totalTargets}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Threads</span>
            <span style={styles.statValue}>{status.totalThreads}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Expected</span>
            <span style={{ color: status.totalExpectedMoney > 0 ? "#00ff00" : "#666" }}>
              {status.totalExpectedMoneyFormatted}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Next ETA</span>
            <span style={styles.etaDisplay}>{status.shortestWait}</span>
          </div>
        </>
      ) : (
        <div style={styles.dim}>No targets</div>
      )}
    </div>
  );
}

function HackDetailPanel({ status, running, toolId }: DetailPanelProps<FormattedHackStatus>): React.ReactElement {
  if (!status) {
    return (
      <div style={styles.panel}>
        <ToolControl tool={toolId} running={running} />
        <div style={{ ...styles.dim, marginTop: "12px" }}>No hackable targets found</div>
      </div>
    );
  }

  // Color helpers
  const getMoneyColor = (percent: number): string => {
    if (percent >= 80) return "#00ff00";
    if (percent >= 50) return "#ffff00";
    return "#ff4444";
  };

  const getSecurityColor = (clean: boolean, delta: string): string => {
    if (clean) return "#00ff00";
    const val = parseFloat(delta);
    if (val <= 5) return "#ffff00";
    return "#ff4444";
  };

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>RAM: </span>
            <span style={styles.statValue}>{status.totalRam}</span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Servers: </span>
            <span style={styles.statValue}>{status.serverCount}</span>
          </span>
        </div>
        <ToolControl tool={toolId} running={running} />
      </div>

      {/* Expected Money Display */}
      <div style={styles.card}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Expected Income (per cycle)</span>
          <span style={{ color: status.totalExpectedMoney > 0 ? "#00ff00" : "#666", fontWeight: "bold" }}>
            {status.totalExpectedMoneyFormatted}
          </span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Running Threads</span>
          <span style={styles.statValue}>{status.totalThreads}</span>
        </div>
      </div>

      {/* Action Breakdown */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Active Targets</span>
            <span style={styles.statHighlight}>{status.activeTargets}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Next Completion</span>
            <span style={styles.etaDisplay}>{status.shortestWait}</span>
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={{ color: ACTION_COLORS.hack }}>HACK</span>
            <span style={styles.statValue}>{status.hackingCount}</span>
          </div>
          <div style={styles.stat}>
            <span style={{ color: ACTION_COLORS.grow }}>GROW</span>
            <span style={styles.statValue}>{status.growingCount}</span>
          </div>
          <div style={styles.stat}>
            <span style={{ color: ACTION_COLORS.weaken }}>WEAKEN</span>
            <span style={styles.statValue}>{status.weakeningCount}</span>
          </div>
        </div>
      </div>

      {/* Target Table */}
      {status.targets.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            TOP TARGETS BY VALUE
            <span style={{ ...styles.dim, marginLeft: "8px", fontWeight: "normal" }}>
              {status.activeTargets} active | {status.totalTargets} total
            </span>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.tableHeader, width: "24px" }}>#</th>
                <th style={styles.tableHeader}>Target</th>
                <th style={{ ...styles.tableHeader, width: "70px" }}>Action</th>
                <th style={{ ...styles.tableHeader, textAlign: "right", width: "70px" }}>Threads</th>
                <th style={{ ...styles.tableHeader, textAlign: "right", width: "80px" }}>Expected</th>
                <th style={{ ...styles.tableHeader, textAlign: "right", width: "60px" }}>Money</th>
                <th style={{ ...styles.tableHeader, textAlign: "right", width: "50px" }}>Sec</th>
                <th style={{ ...styles.tableHeader, textAlign: "right", width: "70px" }}>ETA</th>
              </tr>
            </thead>
            <tbody>
              {status.targets.slice(0, 12).map((target, i) => {
                const rowStyle = i % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const hasJobs = target.totalThreads > 0;

                return (
                  <tr key={target.hostname} style={rowStyle}>
                    <td style={{ ...styles.tableCell, color: "#888" }}>{target.rank}</td>
                    <td style={{ ...styles.tableCell, color: hasJobs ? "#00ffff" : "#666" }}>
                      {target.hostname.substring(0, 16)}
                    </td>
                    <td style={{ ...styles.tableCell, color: hasJobs ? ACTION_COLORS[target.action] : "#666" }}>
                      {target.action.toUpperCase()}
                    </td>
                    <td style={{
                      ...styles.tableCell,
                      textAlign: "right",
                      color: hasJobs ? "#00ff00" : "#666",
                    }}>
                      {hasJobs ? target.totalThreads.toLocaleString() : "-"}
                    </td>
                    <td style={{
                      ...styles.tableCell,
                      textAlign: "right",
                      color: target.expectedMoney > 0 ? "#00ff00" : "#666",
                    }}>
                      {target.expectedMoneyFormatted}
                    </td>
                    <td style={{
                      ...styles.tableCell,
                      textAlign: "right",
                      color: getMoneyColor(target.moneyPercent),
                    }}>
                      {target.moneyPercent.toFixed(0)}%
                    </td>
                    <td style={{
                      ...styles.tableCell,
                      textAlign: "right",
                      color: getSecurityColor(target.securityClean, target.securityDelta),
                    }}>
                      {target.securityDelta}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right", color: "#888" }}>
                      {target.completionEta || target.eta}
                    </td>
                  </tr>
                );
              })}
              {status.targets.length > 12 && (
                <tr style={styles.tableRowAlt}>
                  <td style={{ ...styles.tableCell, ...styles.dim }} colSpan={8}>
                    ... +{status.targets.length - 12} more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendSwatch, backgroundColor: ACTION_COLORS.hack }} />
          <span>Hack</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendSwatch, backgroundColor: ACTION_COLORS.grow }} />
          <span>Grow</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendSwatch, backgroundColor: ACTION_COLORS.weaken }} />
          <span>Weaken</span>
        </div>
        {status.needHigherLevel && (
          <div style={{ ...styles.legendItem, marginLeft: "auto" }}>
            <span style={{ color: "#ffaa00" }}>
              {status.needHigherLevel.count} need higher hack (next: {status.needHigherLevel.nextLevel})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// === PLUGIN EXPORT ===

export const hackPlugin: ToolPlugin<FormattedHackStatus> = {
  name: "HACK",
  id: "hack",
  script: "/hack/distributed.js",
  getFormattedStatus: formatHackStatus,
  OverviewCard: HackOverviewCard,
  DetailPanel: HackDetailPanel,
};
