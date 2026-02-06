/**
 * RAM Calculation Utilities
 *
 * Functions for calculating available RAM, including RAM that could be freed
 * by killing lower-priority scripts.
 *
 * Import with: import { calcAvailableAfterKills, freeRamForTarget } from '/lib/ram-utils';
 */
import { NS } from "@ns";
import { KILL_TIERS } from "/types/ports";

/**
 * Calculate total RAM available after hypothetically killing lower-tier scripts.
 * This includes currently available RAM plus RAM used by killable scripts.
 *
 * @param ns - NetScript context
 * @param host - Server to check (default: "home")
 * @param excludeDashboard - Whether to exclude dashboard from killable scripts (default: true)
 * @returns Total RAM that would be available after killing lower-tier scripts
 */
export function calcAvailableAfterKills(
  ns: NS,
  host = "home",
  excludeDashboard = true
): number {
  let available = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);

  // Determine which tiers can be killed
  const killableTiers = excludeDashboard
    ? KILL_TIERS.slice(0, -1) // Exclude dashboard tier (last one)
    : KILL_TIERS;

  // Add RAM from killable scripts
  const processes = ns.ps(host);
  for (const tier of killableTiers) {
    for (const script of tier) {
      const procs = processes.filter((p) => p.filename === script);
      for (const proc of procs) {
        available += ns.getScriptRam(proc.filename, host) * proc.threads;
      }
    }
  }

  return available;
}

/**
 * Free RAM by killing lower-tier scripts until target RAM is available.
 *
 * @param ns - NetScript context
 * @param targetRam - Amount of RAM needed
 * @param host - Server to free RAM on (default: "home")
 * @param excludeDashboard - Whether to exclude dashboard from killable scripts (default: true)
 * @returns True if target RAM was achieved, false otherwise
 */
export function freeRamForTarget(
  ns: NS,
  targetRam: number,
  host = "home",
  excludeDashboard = true
): boolean {
  let available = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);

  if (available >= targetRam) {
    return true;
  }

  const killableTiers = excludeDashboard
    ? KILL_TIERS.slice(0, -1)
    : KILL_TIERS;

  const killed: string[] = [];

  for (const tierScripts of killableTiers) {
    if (available >= targetRam) break;

    // Get processes matching this tier, sorted by RAM descending
    const processes = ns.ps(host);
    const tierProcs = processes
      .filter((p) => tierScripts.includes(p.filename))
      .map((p) => ({
        pid: p.pid,
        filename: p.filename,
        ram: ns.getScriptRam(p.filename, host) * p.threads,
      }))
      .sort((a, b) => b.ram - a.ram);

    for (const proc of tierProcs) {
      if (available >= targetRam) break;
      ns.kill(proc.pid);
      killed.push(`${proc.filename} (${ns.formatRam(proc.ram)})`);
      available += proc.ram;
    }
  }

  if (killed.length > 0) {
    ns.tprint(`INFO: Killed ${killed.length} process(es) to free RAM: ${killed.join(", ")}`);
  }

  return available >= targetRam;
}

/**
 * Get a breakdown of RAM used by each kill tier.
 * Useful for debugging and understanding RAM usage.
 *
 * @param ns - NetScript context
 * @param host - Server to check (default: "home")
 * @returns Array of tier info with RAM totals
 */
export function getKillTierBreakdown(
  ns: NS,
  host = "home"
): { tier: number; scripts: string[]; totalRam: number; processes: number }[] {
  const processes = ns.ps(host);
  const breakdown: { tier: number; scripts: string[]; totalRam: number; processes: number }[] = [];

  for (let i = 0; i < KILL_TIERS.length; i++) {
    const tierScripts = KILL_TIERS[i];
    let totalRam = 0;
    let processCount = 0;

    for (const script of tierScripts) {
      const procs = processes.filter((p) => p.filename === script);
      for (const proc of procs) {
        totalRam += ns.getScriptRam(proc.filename, host) * proc.threads;
        processCount++;
      }
    }

    breakdown.push({
      tier: i,
      scripts: tierScripts,
      totalRam,
      processes: processCount,
    });
  }

  return breakdown;
}
