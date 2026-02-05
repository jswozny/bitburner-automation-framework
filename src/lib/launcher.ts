/**
 * RAM-Aware Launcher
 *
 * Frees RAM by killing low-priority processes before launching a script.
 * Kill tiers defined in types/ports.ts (single source of truth):
 *   Tier 1: Ephemeral workers (share, hack, grow, weaken)
 *   Tier 2: daemons/share
 *   Tier 3: daemons/hack
 *   Tier 4: dashboard (last resort, relaunches after)
 *
 * NS functions used: getScriptRam, getServerMaxRam, getServerUsedRam, ps, kill, exec
 * Estimated RAM cost: ~3.8 GB (2.2 GB API + 1.6 GB base)
 */
import { NS } from "@ns";
import { KILL_TIERS, QUEUE_PORT, PRIORITY } from "/types/ports";
import type { QueueEntry } from "/types/ports";

/**
 * Launch a script, freeing RAM by killing lower-priority processes if needed.
 *
 * @returns pid of the launched script, or 0 if it could not be launched.
 */
export function ensureRamAndExec(
  ns: NS,
  scriptPath: string,
  host: string,
  threads = 1,
  ...args: (string | number | boolean)[]
): number {
  const requiredRam = ns.getScriptRam(scriptPath, host) * threads;
  if (requiredRam <= 0) {
    ns.tprint(`ERROR: Could not determine RAM for ${scriptPath}`);
    return 0;
  }

  // Check if we already have enough RAM
  let available = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
  if (available >= requiredRam) {
    return ns.exec(scriptPath, host, threads, ...args);
  }

  // Need to free RAM — walk through kill tiers
  let deficit = requiredRam - available;
  const killed: string[] = [];

  for (const tierScripts of KILL_TIERS) {
    if (deficit <= 0) break;

    // Get processes matching this tier, sorted by RAM descending (kill fewest to free most)
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
      if (deficit <= 0) break;
      ns.kill(proc.pid);
      killed.push(`${proc.filename} (pid ${proc.pid}, ${ns.formatRam(proc.ram)})`);
      deficit -= proc.ram;
    }
  }

  if (killed.length > 0) {
    ns.tprint(`INFO: Killed ${killed.length} process(es) to free RAM: ${killed.join(", ")}`);
  }

  // Re-check available RAM after kills
  available = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
  if (available >= requiredRam) {
    return ns.exec(scriptPath, host, threads, ...args);
  }

  ns.tprint(`ERROR: Could not free enough RAM for ${scriptPath} (need ${ns.formatRam(requiredRam)}, have ${ns.formatRam(available)})`);
  return 0;
}

/**
 * Dry-run version: reports what would be killed without actually killing anything.
 *
 * @returns List of processes that would be killed, or empty array if no kills needed.
 */
export function dryRunEnsureRamAndExec(
  ns: NS,
  scriptPath: string,
  host: string,
  threads = 1,
): { wouldKill: { filename: string; pid: number; ram: number }[]; sufficient: boolean } {
  const requiredRam = ns.getScriptRam(scriptPath, host) * threads;
  if (requiredRam <= 0) {
    return { wouldKill: [], sufficient: false };
  }

  const available = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
  if (available >= requiredRam) {
    return { wouldKill: [], sufficient: true };
  }

  let deficit = requiredRam - available;
  const wouldKill: { filename: string; pid: number; ram: number }[] = [];

  for (const tierScripts of KILL_TIERS) {
    if (deficit <= 0) break;

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
      if (deficit <= 0) break;
      wouldKill.push(proc);
      deficit -= proc.ram;
    }
  }

  return { wouldKill, sufficient: deficit <= 0 };
}

/**
 * Enqueue a script for the queue runner to execute.
 * The queue runner (daemons/queue.ts) processes entries by priority.
 *
 * @param mode "force" kills lower-priority scripts, "queue" waits for free RAM
 */
export function queueExec(
  ns: NS,
  scriptPath: string,
  args: (string | number | boolean)[] = [],
  priority: number = PRIORITY.USER_ACTION,
  mode: "force" | "queue" = "queue",
  requester = "launcher",
  manualFallback?: string,
): void {
  const entry: QueueEntry = {
    script: scriptPath,
    args,
    priority,
    mode,
    timestamp: Date.now(),
    requester,
    manualFallback,
  };
  const handle = ns.getPortHandle(QUEUE_PORT);
  handle.write(JSON.stringify(entry));
}
