/**
 * Purchased Server Library
 *
 * Core logic for managing purchased servers.
 * Import with: import { getPservStatus, PservStatus, ... } from '/controllers/pserv';
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";

// === TYPES ===

export interface PservStatus {
  servers: string[];
  serverCount: number;
  serverCap: number;
  totalRam: number;
  minRam: number;
  maxRam: number;
  maxPossibleRam: number;
  allMaxed: boolean;
}

export interface PservConfig {
  prefix: string;
  minRam: number;
  reserve: number;
  oneShot: boolean;
  interval: number;
}

export interface PservCycleResult {
  bought: number;
  upgraded: number;
  waitingFor: string | null;
}

// === CORE LOGIC ===

/**
 * Get status of all purchased servers
 */
export function getPservStatus(ns: NS): PservStatus {
  const servers = ns.getPurchasedServers();
  const serverCap = ns.getPurchasedServerLimit();
  const maxPossibleRam = ns.getPurchasedServerMaxRam();

  if (servers.length === 0) {
    return {
      servers: [],
      serverCount: 0,
      serverCap,
      totalRam: 0,
      minRam: 0,
      maxRam: 0,
      maxPossibleRam,
      allMaxed: false,
    };
  }

  const rams = servers.map((h) => ns.getServerMaxRam(h));
  const totalRam = rams.reduce((a, b) => a + b, 0);
  const minRam = Math.min(...rams);
  const maxRam = Math.max(...rams);
  const allMaxed = minRam >= maxPossibleRam;

  return {
    servers,
    serverCount: servers.length,
    serverCap,
    totalRam,
    minRam,
    maxRam,
    maxPossibleRam,
    allMaxed,
  };
}

/**
 * Best RAM we can afford for a new server
 */
export function getBestAffordableRam(
  ns: NS,
  budget: number,
  minRam: number,
  maxRam: number
): number {
  let best = 0;
  for (let ram = minRam; ram <= maxRam; ram *= 2) {
    if (ns.getPurchasedServerCost(ram) <= budget) best = ram;
    else break;
  }
  return best;
}

/**
 * Best RAM we can upgrade to
 */
export function getBestAffordableUpgrade(
  ns: NS,
  hostname: string,
  budget: number,
  currentRam: number,
  maxRam: number
): number {
  let best = currentRam;
  for (let ram = currentRam * 2; ram <= maxRam; ram *= 2) {
    if (ns.getPurchasedServerUpgradeCost(hostname, ram) <= budget) best = ram;
    else break;
  }
  return best;
}

/**
 * Find the smallest server by RAM
 */
export function findSmallestServer(
  ns: NS
): { hostname: string; ram: number } | null {
  const servers = ns.getPurchasedServers();
  if (servers.length === 0) return null;

  return servers
    .map((h) => ({ hostname: h, ram: ns.getServerMaxRam(h) }))
    .reduce((min, s) => (s.ram < min.ram ? s : min));
}

/**
 * Get next upgrade info for display
 */
export function getNextUpgradeInfo(ns: NS, reserve: number): string | null {
  const smallest = findSmallestServer(ns);
  if (!smallest) return null;

  const maxRam = ns.getPurchasedServerMaxRam();
  if (smallest.ram >= maxRam) return null;

  const nextRam = smallest.ram * 2;
  const cost = ns.getPurchasedServerUpgradeCost(smallest.hostname, nextRam);
  const budget = ns.getServerMoneyAvailable("home") - reserve;

  if (cost <= budget) {
    return `Can upgrade ${smallest.hostname} to ${ns.formatRam(nextRam)}`;
  } else {
    return `Need ${ns.formatNumber(cost - budget)} more for ${smallest.hostname} → ${ns.formatRam(nextRam)}`;
  }
}

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
