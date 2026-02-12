/**
 * Share Daemon
 *
 * Long-running daemon that fills spare RAM with share() threads to boost
 * faction reputation gains, and publishes ShareStatus to the status port
 * for the dashboard.
 *
 * Usage:
 *   run daemons/share.js
 *   run daemons/share.js --one-shot
 *   run daemons/share.js --min-free 16
 *   run daemons/share.js --home-reserve 64
 *   run daemons/share.js --interval 5000
 */
import { NS } from "@ns";
import { COLORS, getAllServers } from "/lib/utils";
import { getShareStatus, DEFAULT_SHARE_SCRIPT, ShareConfig, deployShareScript, launchShareThreads } from "/controllers/share";
import { publishStatus, peekStatus } from "/lib/ports";
import { STATUS_PORTS, ShareStatus, FleetAllocation } from "/types/ports";

// === MODULE-LEVEL CYCLE TRACKING ===
// Share threads are ephemeral (they run share() and exit), so between cycles
// there is a brief window where threads = 0. We use a grace period to show
// the last known thread count instead of flickering to "idle".

let lastKnownThreads = 0;
let lastSeenTime = 0;
const GRACE_PERIOD_MS = 2000;

/**
 * Build a ShareStatus object with formatted values for the dashboard.
 * Handles the ephemeral nature of share threads with cycle-aware state.
 */
function computeShareStatus(ns: NS, targetPercent = 0): ShareStatus {
  const raw = getShareStatus(ns, DEFAULT_SHARE_SCRIPT);
  const now = Date.now();

  // Determine cycle status based on current threads and grace period
  let cycleStatus: ShareStatus["cycleStatus"];
  let displayThreads: number;

  if (raw.totalThreads > 0) {
    // Threads are actively running
    cycleStatus = "active";
    displayThreads = raw.totalThreads;
    lastKnownThreads = raw.totalThreads;
    lastSeenTime = now;
  } else if (now - lastSeenTime < GRACE_PERIOD_MS && lastKnownThreads > 0) {
    // No threads right now, but we just had some - mid-cycle transition
    cycleStatus = "cycle";
    displayThreads = lastKnownThreads;
  } else {
    // No threads and grace period expired - truly idle
    cycleStatus = "idle";
    displayThreads = 0;
  }

  // Format server stats for dashboard
  const serverStats = raw.serverStats.map((s) => ({
    hostname: s.hostname,
    threads: s.threads.toLocaleString(),
  }));

  return {
    totalThreads: displayThreads.toLocaleString(),
    sharePower: `${raw.sharePower.toFixed(3)}x`,
    shareRam: ns.formatRam(raw.shareRam),
    serversWithShare: raw.serversWithShare,
    serverStats,
    cycleStatus,
    lastKnownThreads: lastKnownThreads.toLocaleString(),
    targetPercent: targetPercent > 0 ? targetPercent : undefined,
  };
}

/**
 * Print formatted share status to the script log.
 */
function printStatus(ns: NS, status: ShareStatus, launched: number, serversUsed: number): void {
  const C = COLORS;

  ns.print(`${C.cyan}═══ Share Daemon ═══${C.reset}`);
  ns.print(`${C.dim}Share script RAM: ${status.shareRam}${C.reset}`);
  if (status.targetPercent && status.targetPercent > 0) {
    ns.print(`${C.yellow}Target: ${status.targetPercent}% of capacity${C.reset}`);
  }
  ns.print("");

  // Show cycle status indicator
  switch (status.cycleStatus) {
    case "active":
      ns.print(`${C.green}Status: ACTIVE${C.reset}`);
      break;
    case "cycle":
      ns.print(`${C.yellow}Status: CYCLING${C.reset} ${C.dim}(between share rounds)${C.reset}`);
      break;
    case "idle":
      ns.print(`${C.dim}Status: IDLE${C.reset}`);
      break;
  }

  ns.print(`${C.white}Threads: ${C.green}${status.totalThreads}${C.reset}`);
  ns.print(`${C.white}Share Power: ${C.green}${status.sharePower}${C.reset} reputation gain`);
  ns.print(`${C.white}Servers: ${status.serversWithShare}${C.reset}`);

  // Show top servers
  if (status.serverStats.length > 0) {
    ns.print("");
    ns.print(`${C.dim}Top servers by share threads:${C.reset}`);
    for (const s of status.serverStats.slice(0, 5)) {
      ns.print(`  ${C.dim}${s.hostname.padEnd(20)}${C.reset} ${s.threads} threads`);
    }
    if (status.serverStats.length > 5) {
      ns.print(`  ${C.dim}... +${status.serverStats.length - 5} more${C.reset}`);
    }
  }

  ns.print("");
  ns.print(
    `${C.white}Launched this cycle: ${C.yellow}${launched.toLocaleString()}${C.reset} on ${serversUsed} servers`,
  );
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["min-free", 4],
    ["home-reserve", 32],
    ["interval", 10000],
    ["one-shot", false],
    ["target-percent", 0],
  ]) as {
    "min-free": number;
    "home-reserve": number;
    interval: number;
    "one-shot": boolean;
    "target-percent": number;
    _: string[];
  };

  const config: ShareConfig = {
    minFree: Number(flags["min-free"]),
    homeReserve: Number(flags["home-reserve"]),
    interval: Number(flags.interval),
    oneShot: flags["one-shot"],
    shareScript: DEFAULT_SHARE_SCRIPT,
    targetPercent: Number(flags["target-percent"]),
  };

  // Deploy share script to all servers on startup
  await deployShareScript(ns, DEFAULT_SHARE_SCRIPT);

  // Verify share script exists
  const shareRam = ns.getScriptRam(DEFAULT_SHARE_SCRIPT);
  if (shareRam === 0) {
    ns.tprint(`${COLORS.red}ERROR: Could not find ${DEFAULT_SHARE_SCRIPT}${COLORS.reset}`);
    return;
  }

  // Wait for fleet allocation from hack daemon (up to 10s)
  {
    const POLL_MS = 500;
    const MAX_WAIT = 10_000;
    let waited = 0;
    while (waited < MAX_WAIT) {
      if (peekStatus<FleetAllocation>(ns, STATUS_PORTS.fleet)) break;
      await ns.sleep(POLL_MS);
      waited += POLL_MS;
    }
  }

  do {
    ns.clearLog();

    // Read fleet allocation from hack daemon (if running)
    const fleetAllocation = peekStatus<FleetAllocation>(ns, STATUS_PORTS.fleet);
    const allowedServers = fleetAllocation?.shareServers
      ? new Set(fleetAllocation.shareServers)
      : undefined; // No allocation = use everything (hack not running)

    // Launch share threads on available/assigned servers
    const cycleResult = launchShareThreads(ns, config, allowedServers);

    // Compute formatted status for the dashboard
    const shareStatus = computeShareStatus(ns, config.targetPercent);

    // Publish to port for dashboard consumption
    publishStatus(ns, STATUS_PORTS.share, shareStatus);

    // Print terminal lines
    printStatus(ns, shareStatus, cycleResult.launchedThreads, cycleResult.serversUsed);

    if (!config.oneShot) {
      ns.print(
        `\n${COLORS.dim}Next check in ${config.interval / 1000}s...${COLORS.reset}`,
      );
      await ns.sleep(config.interval);
    }
  } while (!config.oneShot);
}
