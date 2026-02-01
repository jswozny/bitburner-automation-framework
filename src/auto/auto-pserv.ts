import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import {
  getPservStatus,
  getBestAffordableRam,
  getBestAffordableUpgrade,
  PservStatus,
  PservConfig,
  PservCycleResult,
} from "/lib/pserv";

// Re-export types for backwards compatibility
export type { PservStatus, PservConfig, PservCycleResult };
export { getPservStatus, getBestAffordableRam, getBestAffordableUpgrade };

/**
 * Auto Purchase & Upgrade Servers
 *
 * Fills all server slots, then upgrades smallest servers first.
 * Processes multiple purchases/upgrades per cycle until funds run out.
 *
 * Run: run auto/auto-pserv.js              (continuous mode)
 *      run auto/auto-pserv.js --one-shot   (single execution)
 *      run auto/auto-pserv.js --min-ram 64 (minimum RAM threshold)
 *      run auto/auto-pserv.js --reserve 1b (keep $1b in reserve)
 */

// === CORE LOGIC ===

/**
 * Run one cycle of purchase/upgrade logic
 */
export async function runPservCycle(
  ns: NS,
  config: PservConfig
): Promise<PservCycleResult> {
  const C = COLORS;
  const { prefix, minRam, reserve } = config;
  const MAX_RAM = ns.getPurchasedServerMaxRam();
  const SERVER_CAP = ns.getPurchasedServerLimit();

  let bought = 0;
  let upgraded = 0;
  let waitingFor: string | null = null;

  // === PHASE 1: FILL EMPTY SLOTS ===
  while (ns.getPurchasedServers().length < SERVER_CAP) {
    const budget = ns.getServerMoneyAvailable("home") - reserve;
    const bestRam = getBestAffordableRam(ns, budget, minRam, MAX_RAM);

    if (bestRam <= 0) {
      const needed = ns.getPurchasedServerCost(minRam);
      waitingFor = `Need ${ns.formatNumber(needed)} for ${ns.formatRam(minRam)} server`;
      ns.print(`${C.yellow}WAITING: ${waitingFor}${C.reset}`);
      break;
    }

    const cost = ns.getPurchasedServerCost(bestRam);
    const name = `${prefix}-${Date.now().toString(36)}`;

    if (ns.purchaseServer(name, bestRam)) {
      ns.print(
        `${C.green}BOUGHT: ${name} @ ${ns.formatRam(bestRam)} for ${ns.formatNumber(cost)}${C.reset}`
      );
      bought++;
    } else {
      ns.print(`${C.red}FAILED: Could not purchase ${name}${C.reset}`);
      break;
    }
    await ns.sleep(5);
  }

  // === PHASE 2: UPGRADE SMALLEST SERVERS ===
  let keepUpgrading = ns.getPurchasedServers().length >= SERVER_CAP;
  while (keepUpgrading) {
    const budget = ns.getServerMoneyAvailable("home") - reserve;

    // Find the actual smallest server each iteration
    const servers = ns.getPurchasedServers();
    if (servers.length === 0) {
      keepUpgrading = false;
      continue;
    }

    const smallest = servers
      .map((h) => ({ hostname: h, ram: ns.getServerMaxRam(h) }))
      .reduce((min, s) => (s.ram < min.ram ? s : min));

    if (smallest.ram >= MAX_RAM) {
      ns.print(`${C.green}ALL MAXED: Every server at ${ns.formatRam(MAX_RAM)}!${C.reset}`);
      keepUpgrading = false;
      continue;
    }

    const targetRam = getBestAffordableUpgrade(
      ns,
      smallest.hostname,
      budget,
      smallest.ram,
      MAX_RAM
    );

    if (targetRam <= smallest.ram) {
      const nextRam = smallest.ram * 2;
      const needed = ns.getPurchasedServerUpgradeCost(smallest.hostname, nextRam);
      waitingFor = `Need ${ns.formatNumber(needed)} to upgrade ${smallest.hostname} (${ns.formatRam(smallest.ram)} → ${ns.formatRam(nextRam)})`;
      ns.print(`${C.yellow}WAITING: ${waitingFor}${C.reset}`);
      keepUpgrading = false;
      continue;
    }

    const cost = ns.getPurchasedServerUpgradeCost(smallest.hostname, targetRam);

    if (ns.upgradePurchasedServer(smallest.hostname, targetRam)) {
      ns.print(
        `${C.green}UPGRADED: ${smallest.hostname} ${ns.formatRam(smallest.ram)} → ${ns.formatRam(targetRam)} for ${ns.formatNumber(cost)}${C.reset}`
      );
      upgraded++;
    } else {
      ns.print(`${C.red}FAILED: Could not upgrade ${smallest.hostname}${C.reset}`);
      keepUpgrading = false;
      continue;
    }
    await ns.sleep(5);
  }

  return { bought, upgraded, waitingFor };
}

// === DISPLAY ===

/**
 * Format server status for display
 */
export function formatPservStatus(ns: NS, status: PservStatus): string[] {
  const C = COLORS;
  const lines: string[] = [];

  lines.push(`${C.cyan}═══ Auto Pserv ═══${C.reset}`);
  lines.push(`Servers: ${status.serverCount}/${status.serverCap}`);
  lines.push(`Total RAM: ${ns.formatRam(status.totalRam)}`);

  if (status.serverCount > 0) {
    lines.push(
      `Range: ${ns.formatRam(status.minRam)} – ${ns.formatRam(status.maxRam)}`
    );
    if (status.allMaxed) {
      lines.push(`${C.green}All servers maxed at ${ns.formatRam(status.maxPossibleRam)}!${C.reset}`);
    }
  }

  return lines;
}

// === RUNNER ===

export async function main(ns: NS): Promise<void> {
  const FLAGS = ns.flags([
    ["prefix", "pserv"],
    ["min-ram", 8],
    ["reserve", 0],
    ["one-shot", false],
    ["interval", 10000],
  ]) as {
    prefix: string;
    "min-ram": number;
    reserve: number;
    "one-shot": boolean;
    interval: number;
    _: string[];
  };

  const C = COLORS;

  const config: PservConfig = {
    prefix: String(FLAGS.prefix),
    minRam: Number(FLAGS["min-ram"]),
    reserve: Number(FLAGS.reserve),
    oneShot: FLAGS["one-shot"],
    interval: Number(FLAGS.interval),
  };

  ns.disableLog("ALL");

  if (!config.oneShot) {
    ns.ui.openTail();
  }

  do {
    ns.clearLog();

    const result = await runPservCycle(ns, config);
    const status = getPservStatus(ns);
    const lines = formatPservStatus(ns, status);

    for (const line of lines) {
      ns.print(line);
    }

    ns.print(`${C.dim}This cycle: ${result.bought} bought, ${result.upgraded} upgraded${C.reset}`);

    if (!config.oneShot) {
      ns.print(`${C.dim}Next check in ${config.interval / 1000}s...${C.reset}`);
      await ns.sleep(config.interval);
    }
  } while (!config.oneShot);
}
