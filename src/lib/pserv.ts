/**
 * Purchased Server Library
 *
 * Core logic for managing purchased servers.
 * Import with: import { getPservStatus, PservStatus, ... } from '/lib/pserv';
 */
import { NS } from "@ns";

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
