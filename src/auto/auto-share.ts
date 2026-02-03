import { NS } from "@ns";
import { COLORS, getAllServers } from "/lib/utils";
import {
  getShareStatus,
  ShareStatus,
  ShareConfig,
  ShareCycleResult,
  DEFAULT_SHARE_SCRIPT,
} from "/lib/share";

// Re-export types for backwards compatibility
export type { ShareStatus, ShareConfig, ShareCycleResult };
export { getShareStatus, DEFAULT_SHARE_SCRIPT };

/**
 * Auto Share Manager
 *
 * Continuously monitors for spare RAM across all servers and fills it
 * with share() threads to boost faction reputation gains.
 *
 * Run: run auto/auto-share.js
 *      run auto/auto-share.js --one-shot
 *      run auto/auto-share.js --min-free 16   (leave at least 16GB free per server)
 *      run auto/auto-share.js --home-reserve 64
 */

// === CORE LOGIC ===

/**
 * Deploy share script to all accessible servers
 */
export async function deployShareScript(
  ns: NS,
  script: string
): Promise<number> {
  let deployed = 0;
  for (const server of getAllServers(ns)) {
    const info = ns.getServer(server);
    if (info.maxRam > 0 && info.hasAdminRights) {
      await ns.scp(script, server, "home");
      deployed++;
    }
  }
  return deployed;
}

/**
 * Launch share threads on available servers
 */
export function launchShareThreads(
  ns: NS,
  config: ShareConfig
): ShareCycleResult {
  const { minFree, homeReserve, shareScript } = config;
  const shareRam = ns.getScriptRam(shareScript);

  if (shareRam === 0) {
    return { launchedThreads: 0, serversUsed: 0 };
  }

  let launchedThreads = 0;
  let serversUsed = 0;

  for (const hostname of getAllServers(ns)) {
    const server = ns.getServer(hostname);
    if (!server.hasAdminRights) continue;
    if (server.maxRam === 0) continue;

    // Calculate available RAM (accounting for reserves)
    const reserve = hostname === "home" ? homeReserve : minFree;
    const available = server.maxRam - server.ramUsed - reserve;

    // How many share threads can we fit?
    const canRun = Math.floor(available / shareRam);

    if (canRun > 0) {
      const pid = ns.exec(shareScript, hostname, canRun, Date.now());
      if (pid > 0) {
        launchedThreads += canRun;
        serversUsed++;
      }
    }
  }

  return { launchedThreads, serversUsed };
}

// === DISPLAY ===

/**
 * Format share status for display
 */
export function formatShareStatus(
  ns: NS,
  status: ShareStatus,
  config: ShareConfig
): string[] {
  const C = COLORS;
  const lines: string[] = [];

  lines.push(`${C.cyan}═══ Auto Share Manager ═══${C.reset}`);
  lines.push(
    `${C.dim}Share RAM: ${ns.formatRam(status.shareRam)} | Min free: ${ns.formatRam(config.minFree)} | Home reserve: ${ns.formatRam(config.homeReserve)}${C.reset}`
  );
  lines.push("");

  lines.push(
    `${C.white}Active Share Threads: ${C.green}${status.totalThreads.toLocaleString()}${C.reset}`
  );
  lines.push(
    `${C.white}Share Power: ${C.green}${status.sharePower.toFixed(3)}x${C.reset} reputation gain`
  );

  // Show top servers by share threads
  if (status.serverStats.length > 0) {
    lines.push("");
    lines.push(`${C.dim}Top servers by share threads:${C.reset}`);
    for (const s of status.serverStats.slice(0, 5)) {
      lines.push(
        `  ${C.dim}${s.hostname.padEnd(20)}${C.reset} ${s.threads.toLocaleString()} threads`
      );
    }
    if (status.serverStats.length > 5) {
      lines.push(`  ${C.dim}... +${status.serverStats.length - 5} more${C.reset}`);
    }
  }

  return lines;
}

// === RUNNER ===

export async function main(ns: NS): Promise<void> {
  const FLAGS = ns.flags([
    ["min-free", 4],
    ["home-reserve", 32],
    ["interval", 10000],
    ["one-shot", false],
  ]) as {
    "min-free": number;
    "home-reserve": number;
    interval: number;
    "one-shot": boolean;
    _: string[];
  };

  const C = COLORS;

  const config: ShareConfig = {
    minFree: Number(FLAGS["min-free"]),
    homeReserve: Number(FLAGS["home-reserve"]),
    interval: Number(FLAGS.interval),
    oneShot: FLAGS["one-shot"],
    shareScript: DEFAULT_SHARE_SCRIPT,
  };

  // Deploy share script to all servers
  await deployShareScript(ns, DEFAULT_SHARE_SCRIPT);

  // Get RAM cost of share script
  const shareRam = ns.getScriptRam(DEFAULT_SHARE_SCRIPT);
  if (shareRam === 0) {
    ns.tprint(`${C.red}ERROR: Could not find ${DEFAULT_SHARE_SCRIPT}${C.reset}`);
    return;
  }

  ns.print(`${C.cyan}Share script RAM: ${ns.formatRam(shareRam)}${C.reset}`);

  do {
    ns.clearLog();

    // Launch new share threads
    const cycleResult = launchShareThreads(ns, config);

    // Get current status
    const status = getShareStatus(ns, DEFAULT_SHARE_SCRIPT);
    const lines = formatShareStatus(ns, status, config);

    for (const line of lines) {
      ns.print(line);
    }

    ns.print("");
    ns.print(
      `${C.white}Launched this cycle: ${C.yellow}${cycleResult.launchedThreads.toLocaleString()}${C.reset} on ${cycleResult.serversUsed} servers`
    );

    if (!config.oneShot) {
      ns.print(`\n${C.dim}Next check in ${config.interval / 1000}s...${C.reset}`);
      await ns.sleep(config.interval);
    }
  } while (!config.oneShot);
}
