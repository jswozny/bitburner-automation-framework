/**
 * Server Cache
 *
 * TTL-based caching wrapper around getAllServers() to avoid redundant BFS
 * scans within the same process. Module-level cache is shared across all
 * callers within a single Bitburner script instance.
 *
 * Import with: import { getCachedServers, invalidateServerCache } from "/lib/server-cache";
 */
import { NS } from "@ns";
import { getAllServers } from "/lib/utils";

// Module-level cache
let cachedServers: string[] | null = null;
let cacheTimestamp = 0;
const DEFAULT_TTL_MS = 10_000;

/**
 * Get all servers, returning a cached result if within the TTL window.
 */
export function getCachedServers(ns: NS, ttlMs = DEFAULT_TTL_MS): string[] {
  if (cachedServers !== null && (Date.now() - cacheTimestamp) < ttlMs) {
    return cachedServers;
  }

  cachedServers = getAllServers(ns);
  cacheTimestamp = Date.now();
  return cachedServers;
}

/**
 * Invalidate the server cache so the next call to getCachedServers()
 * triggers a fresh BFS scan. Call this after rooting new servers.
 */
export function invalidateServerCache(): void {
  cachedServers = null;
}
