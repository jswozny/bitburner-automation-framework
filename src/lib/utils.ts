/**
 * Shared utilities for Bitburner scripts
 *
 * Import with: import { COLORS, getAllServers, ... } from '/lib/utils';
 */
import { NS, Server } from "@ns";

// === ANSI COLORS ===
export const COLORS = {
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  white: "\u001b[37m",
  dim: "\u001b[2m",
  gray: "\u001b[30m",
  bold: "\u001b[1m",
  reset: "\u001b[0m",
} as const;

// === SERVER DISCOVERY ===

/**
 * Get all servers via BFS from home
 */
export function getAllServers(ns: NS): string[] {
  const servers = new Set<string>(["home"]);
  const queue: string[] = ["home"];

  while (queue.length > 0) {
    const current = queue.shift() ?? "";
    let neighbors: string[];
    try { neighbors = ns.scan(current); } catch { continue; }
    for (const neighbor of neighbors) {
      if (!servers.has(neighbor) && neighbor !== "darkweb") {
        servers.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return [...servers];
}

export interface DiscoveryResult {
  hosts: string[];
  depthByHost: Map<string, number>;
  parentByHost: Map<string, string | null>;
}

/**
 * Discover all servers with depth and parent tracking for path reconstruction
 */
export function discoverAllWithDepthAndPath(
  ns: NS,
  start: string,
  maxDepth: number
): DiscoveryResult {
  const depthByHost = new Map<string, number>([[start, 0]]);
  const parentByHost = new Map<string, string | null>([[start, null]]);
  const q: string[] = [start];

  while (q.length) {
    const cur = q.shift() ?? "";
    const curDepth = depthByHost.get(cur) ?? 0;

    for (const n of ns.scan(cur)) {
      if (n === "darkweb") continue;
      const candDepth = curDepth + 1;
      const prevDepth = depthByHost.get(n);

      if (prevDepth === undefined || candDepth < prevDepth) {
        depthByHost.set(n, candDepth);
        parentByHost.set(n, cur);

        if (maxDepth < 0 || curDepth + 1 < maxDepth) q.push(n);
      }
    }
  }

  const hosts = [...depthByHost.keys()].sort((a, b) => {
    const da = depthByHost.get(a) ?? 0;
    const db = depthByHost.get(b) ?? 0;
    return da - db || a.localeCompare(b);
  });

  return { hosts, depthByHost, parentByHost };
}

/**
 * Reconstruct path from parent map as string
 */
export function pathTo(
  parentByHost: Map<string, string | null>,
  target: string,
  includeStart = false
): string {
  const reversed = pathToArray(parentByHost, target);
  return includeStart ? reversed.join(" > ") : reversed.slice(1).join(" > ");
}

/**
 * Get array of hostnames in path from start to target
 */
export function pathToArray(
  parentByHost: Map<string, string | null>,
  target: string
): string[] {
  const path: string[] = [];
  let cur: string | null | undefined = target;

  while (cur !== null && cur !== undefined) {
    path.push(cur);
    cur = parentByHost.get(cur);
  }

  return path.reverse();
}

// === HACKING UTILITIES ===

export type HackAction = "weaken" | "grow" | "hack";

/**
 * Determine what action a server needs (weaken/grow/hack)
 */
export function determineAction(
  server: Server,
  moneyThreshold: number,
  securityBuffer: number
): HackAction {
  const securityThresh = (server.minDifficulty ?? 0) + securityBuffer;
  const moneyThresh = (server.moneyMax ?? 0) * moneyThreshold;

  if ((server.hackDifficulty ?? 0) > securityThresh) {
    return "weaken";
  } else if ((server.moneyAvailable ?? 0) < moneyThresh) {
    return "grow";
  } else {
    return "hack";
  }
}

/**
 * Score a target for hacking priority
 * Higher is better: moneyMax / hackTime / minDifficulty
 */
export function scoreTarget(ns: NS, hostname: string): number {
  const server = ns.getServer(hostname);
  const hackTime = ns.getHackTime(hostname);
  return (server.moneyMax ?? 0) / hackTime / (server.minDifficulty ?? 1);
}

// === DISPLAY UTILITIES ===

/**
 * Make a simple progress bar
 */
export function makeBar(
  percent: number,
  width: number,
  fillColor: string = COLORS.green
): string {
  const filled = Math.round(Math.min(1, Math.max(0, percent)) * width);
  const empty = width - filled;
  return `[${fillColor}${"█".repeat(filled)}${COLORS.reset}${COLORS.dim}${"░".repeat(empty)}${COLORS.reset}]`;
}

/**
 * Format seconds to human readable time
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "???";

  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}
