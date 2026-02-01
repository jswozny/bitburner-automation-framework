import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import {
  analyzeNukableServers,
  NukeResult,
  ServerNukeInfo,
  getPotentialTargets,
  countAvailableTools,
} from "/lib/nuke";

// Re-export types for backwards compatibility
export type { NukeResult, ServerNukeInfo };
export { analyzeNukableServers, getPotentialTargets, countAvailableTools };

// === TYPES ===

export interface NukeConfig {
  oneShot: boolean;
  interval: number;
}

// === DISPLAY ===

/**
 * Format nuke results for display
 */
export function formatNukeResult(ns: NS, result: NukeResult): string[] {
  const C = COLORS;
  const lines: string[] = [];

  lines.push(`${C.cyan}═══ Auto Nuke ═══${C.reset}`);
  lines.push(
    `${C.dim}Tools: ${result.toolCount}/5 | Servers: ${result.rootedCount}/${result.totalServers} rooted${C.reset}`
  );
  lines.push("");

  if (result.nuked.length > 0) {
    lines.push(`${C.green}NUKED THIS CYCLE:${C.reset}`);
    for (const r of result.nuked) {
      lines.push(`  ${C.green}✓${C.reset} ${r.hostname}`);
    }
    lines.push("");
  }

  if (result.notReady.length > 0 && result.notReady.length <= 10) {
    lines.push(`${C.yellow}NOT READY:${C.reset}`);
    for (const r of result.notReady.slice(0, 10)) {
      lines.push(`  ${C.dim}${r.hostname}: ${r.reason}${C.reset}`);
    }
    if (result.notReady.length > 10) {
      lines.push(`  ${C.dim}... +${result.notReady.length - 10} more${C.reset}`);
    }
  }

  return lines;
}

// === RUNNER ===

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ["one-shot", false],
    ["interval", 30000],
  ]) as { "one-shot": boolean; interval: number; _: string[] };

  const oneShot = flags["one-shot"];
  const interval = flags.interval;

  ns.disableLog("ALL");

  if (!oneShot) {
    ns.ui.openTail();
  }

  do {
    ns.clearLog();

    const result = analyzeNukableServers(ns);
    const lines = formatNukeResult(ns, result);

    for (const line of lines) {
      ns.print(line);
    }

    if (result.nuked.length > 0) {
      ns.tprint(
        `${COLORS.green}Nuked ${result.nuked.length} server(s): ${result.nuked.map((r) => r.hostname).join(", ")}${COLORS.reset}`
      );
    }

    if (!oneShot) {
      ns.print(
        `\n${COLORS.dim}Next check in ${interval / 1000}s...${COLORS.reset}`
      );
      await ns.sleep(interval);
    }
  } while (!oneShot);
}
