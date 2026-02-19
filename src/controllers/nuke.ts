/**
 * Nuke/Root Access Library
 *
 * Core logic for analyzing and nuking servers.
 * Import with: import { analyzeNukableServers, NukeResult, ... } from '/controllers/nuke';
 */
import { NS } from "@ns";
import { getCachedServers } from "/lib/server-cache";
import { exploitServer, countAvailableTools, ExploitResult } from "/controllers/exploit";

// Re-export for convenience
export { ExploitResult, countAvailableTools };

// === TYPES ===

export interface ServerNukeInfo {
  hostname: string;
  requiredPorts: number;
  requiredHacking: number;
}

export interface NukeResult {
  nuked: ExploitResult[];
  alreadyRooted: string[];
  notReady: { hostname: string; reason: string }[];
  totalServers: number;
  rootedCount: number;
  toolCount: number;
}

// === CORE LOGIC ===

/**
 * Analyze all servers and categorize them by nuke status
 */
export function analyzeNukableServers(ns: NS): NukeResult {
  const player = ns.getPlayer();
  const numHackTools = countAvailableTools(ns);
  const allServers = getCachedServers(ns);

  const nuked: ExploitResult[] = [];
  const alreadyRooted: string[] = [];
  const notReady: { hostname: string; reason: string }[] = [];
  let rootedCount = 0;

  for (const hostname of allServers) {
    const server = ns.getServer(hostname);

    if (server.hasAdminRights) {
      alreadyRooted.push(hostname);
      rootedCount++;
      continue;
    }

    const requiredPorts = server.numOpenPortsRequired ?? 0;
    const requiredHacking = server.requiredHackingSkill ?? 0;

    // Check if we can hack it
    if (requiredHacking > player.skills.hacking) {
      notReady.push({
        hostname,
        reason: `need hacking ${requiredHacking} (have ${player.skills.hacking})`,
      });
      continue;
    }

    // Check if we have enough tools
    if (requiredPorts > numHackTools) {
      notReady.push({
        hostname,
        reason: `need ${requiredPorts} ports (have ${numHackTools} tools)`,
      });
      continue;
    }

    // Server is ready to nuke
    const result = exploitServer(ns, hostname);
    if (result.success) {
      nuked.push(result);
      rootedCount++;
    } else {
      notReady.push({ hostname, reason: "nuke failed" });
    }
  }

  return {
    nuked,
    alreadyRooted,
    notReady,
    totalServers: allServers.length,
    rootedCount,
    toolCount: numHackTools,
  };
}

/**
 * Get servers that could be nuked if we had more tools/hacking
 */
export function getPotentialTargets(ns: NS): ServerNukeInfo[] {
  const player = ns.getPlayer();
  const numHackTools = countAvailableTools(ns);
  const allServers = getCachedServers(ns);
  const targets: ServerNukeInfo[] = [];

  for (const hostname of allServers) {
    const server = ns.getServer(hostname);
    if (server.hasAdminRights) continue;

    const requiredPorts = server.numOpenPortsRequired ?? 0;
    const requiredHacking = server.requiredHackingSkill ?? 0;

    // Only include if we're somewhat close
    if (
      requiredHacking <= player.skills.hacking + 50 ||
      requiredPorts <= numHackTools + 1
    ) {
      targets.push({
        hostname,
        requiredPorts,
        requiredHacking,
      });
    }
  }

  return targets.sort((a, b) => a.requiredHacking - b.requiredHacking);
}

/**
 * Get a quick status snapshot without attempting to nuke anything
 */
export function getNukeStatus(ns: NS): Omit<NukeResult, "nuked"> & { nuked: never[] } {
  const player = ns.getPlayer();
  const numHackTools = countAvailableTools(ns);
  const allServers = getCachedServers(ns);

  const alreadyRooted: string[] = [];
  const notReady: { hostname: string; reason: string }[] = [];
  let rootedCount = 0;

  for (const hostname of allServers) {
    const server = ns.getServer(hostname);

    if (server.hasAdminRights) {
      alreadyRooted.push(hostname);
      rootedCount++;
      continue;
    }

    const requiredPorts = server.numOpenPortsRequired ?? 0;
    const requiredHacking = server.requiredHackingSkill ?? 0;

    if (requiredHacking > player.skills.hacking) {
      notReady.push({
        hostname,
        reason: `need hacking ${requiredHacking} (have ${player.skills.hacking})`,
      });
    } else if (requiredPorts > numHackTools) {
      notReady.push({
        hostname,
        reason: `need ${requiredPorts} ports (have ${numHackTools} tools)`,
      });
    } else {
      // Could be nuked but we're not doing it in status mode
      notReady.push({
        hostname,
        reason: "ready to nuke",
      });
    }
  }

  return {
    nuked: [],
    alreadyRooted,
    notReady,
    totalServers: allServers.length,
    rootedCount,
    toolCount: numHackTools,
  };
}
