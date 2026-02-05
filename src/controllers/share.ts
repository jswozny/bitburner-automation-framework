/**
 * Share Power Library
 *
 * Core logic for managing share() threads across servers.
 * Import with: import { getShareStatus, ShareStatus, ... } from '/controllers/share';
 */
import { NS } from "@ns";
import { getAllServers } from "/lib/utils";

// === CONSTANTS ===

export const DEFAULT_SHARE_SCRIPT = "/workers/share.js";

// === TYPES ===

export interface ServerShareInfo {
  hostname: string;
  threads: number;
  maxRam: number;
  usedRam: number;
}

export interface ShareStatus {
  totalThreads: number;
  sharePower: number;
  serverStats: ServerShareInfo[];
  shareRam: number;
  serversWithShare: number;
}

export interface ShareConfig {
  minFree: number;
  homeReserve: number;
  oneShot: boolean;
  interval: number;
  shareScript: string;
}

export interface ShareCycleResult {
  launchedThreads: number;
  serversUsed: number;
}

// === CORE LOGIC ===

/**
 * Get current share status across all servers
 */
export function getShareStatus(
  ns: NS,
  shareScript: string = DEFAULT_SHARE_SCRIPT
): ShareStatus {
  const shareRam = ns.getScriptRam(shareScript);
  const serverStats: ServerShareInfo[] = [];
  let totalThreads = 0;

  for (const hostname of getAllServers(ns)) {
    const procs = ns.ps(hostname).filter((p) =>
      p.filename === shareScript || p.filename.endsWith("workers/share.js")
    );
    const threads = procs.reduce((sum, p) => sum + p.threads, 0);

    if (threads > 0) {
      const server = ns.getServer(hostname);
      serverStats.push({
        hostname,
        threads,
        maxRam: server.maxRam,
        usedRam: server.ramUsed,
      });
      totalThreads += threads;
    }
  }

  serverStats.sort((a, b) => b.threads - a.threads);

  return {
    totalThreads,
    sharePower: ns.getSharePower(),
    serverStats,
    shareRam,
    serversWithShare: serverStats.length,
  };
}

/**
 * Calculate available RAM for share threads on a server
 */
export function getAvailableShareRam(
  ns: NS,
  hostname: string,
  minFree: number,
  homeReserve: number
): number {
  const server = ns.getServer(hostname);
  if (!server.hasAdminRights || server.maxRam === 0) return 0;

  const reserve = hostname === "home" ? homeReserve : minFree;
  return Math.max(0, server.maxRam - server.ramUsed - reserve);
}

/**
 * Calculate how many share threads can fit in available RAM
 */
export function calculateShareThreads(
  ns: NS,
  hostname: string,
  shareScript: string,
  minFree: number,
  homeReserve: number
): number {
  const shareRam = ns.getScriptRam(shareScript);
  if (shareRam === 0) return 0;

  const available = getAvailableShareRam(ns, hostname, minFree, homeReserve);
  return Math.floor(available / shareRam);
}

/**
 * Get total potential share capacity across all servers
 */
export function getTotalShareCapacity(
  ns: NS,
  shareScript: string = DEFAULT_SHARE_SCRIPT,
  minFree = 4,
  homeReserve = 64
): { totalThreads: number; totalRam: number } {
  const shareRam = ns.getScriptRam(shareScript);
  if (shareRam === 0) return { totalThreads: 0, totalRam: 0 };

  let totalThreads = 0;
  let totalRam = 0;

  for (const hostname of getAllServers(ns)) {
    const available = getAvailableShareRam(ns, hostname, minFree, homeReserve);
    const threads = Math.floor(available / shareRam);
    totalThreads += threads;
    totalRam += available;
  }

  return { totalThreads, totalRam };
}

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
