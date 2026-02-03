import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import {
  analyzeDarkwebPrograms,
  getDarkwebStatus,
  purchaseTorRouter,
  formatMoney,
  ProgramPurchaseResult,
  DarkwebProgram,
} from "/lib/darkweb";

// Re-export types for backwards compatibility
export type { ProgramPurchaseResult, DarkwebProgram };
export { analyzeDarkwebPrograms, getDarkwebStatus, formatMoney };

// === TYPES ===

export interface BuyToolsConfig {
  oneShot: boolean;
  interval: number;
}

// === DISPLAY ===

/**
 * Format purchase results for display
 */
export function formatPurchaseResult(ns: NS, result: ProgramPurchaseResult): string[] {
  const C = COLORS;
  const lines: string[] = [];

  lines.push(`${C.cyan}═══ Auto Buy Tools ═══${C.reset}`);

  if (!result.hasTorRouter) {
    lines.push(`${C.yellow}TOR Router not owned${C.reset}`);
    lines.push(`${C.dim}Cost: ${formatMoney(200000)}${C.reset}`);
    lines.push(`${C.dim}Money: ${formatMoney(result.playerMoney)}${C.reset}`);
    if (result.playerMoney >= 200000) {
      lines.push(`${C.green}Can afford TOR - will attempt purchase${C.reset}`);
    } else {
      lines.push(
        `${C.dim}Need: ${formatMoney(200000 - result.playerMoney)} more${C.reset}`
      );
    }
    return lines;
  }

  lines.push(
    `${C.dim}Programs: ${result.ownedCount}/${result.totalPrograms} owned | Money: ${formatMoney(result.playerMoney)}${C.reset}`
  );
  lines.push("");

  if (result.purchased.length > 0) {
    lines.push(`${C.green}PURCHASED THIS CYCLE:${C.reset}`);
    for (const p of result.purchased) {
      lines.push(`  ${C.green}✓${C.reset} ${p.name} (${formatMoney(p.cost)})`);
    }
    lines.push("");
  }

  if (result.alreadyOwned.length > 0) {
    lines.push(`${C.dim}OWNED:${C.reset}`);
    for (const p of result.alreadyOwned) {
      lines.push(`  ${C.dim}✓ ${p.name}${C.reset}`);
    }
    lines.push("");
  }

  if (result.cannotAfford.length > 0) {
    lines.push(`${C.yellow}NOT YET AFFORDABLE:${C.reset}`);
    for (const p of result.cannotAfford) {
      const needed = p.cost - result.playerMoney;
      lines.push(
        `  ${C.dim}${p.name}: ${formatMoney(p.cost)} (need ${formatMoney(needed)})${C.reset}`
      );
    }
    lines.push("");
  }

  if (result.nextProgram) {
    lines.push(`${C.cyan}NEXT TARGET:${C.reset}`);
    lines.push(
      `  ${result.nextProgram.name} - ${formatMoney(result.moneyUntilNext)} to go`
    );
  } else if (result.ownedCount === result.totalPrograms) {
    lines.push(`${C.green}All programs owned!${C.reset}`);
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

  do {
    ns.clearLog();

    // Try to buy TOR if we don't have it
    const hasTor = ns.singularity.getDarkwebPrograms().length > 0 ||
      purchaseTorRouter(ns);

    if (!hasTor) {
      const playerMoney = ns.getServerMoneyAvailable("home");
      const lines = formatPurchaseResult(ns, {
        purchased: [],
        alreadyOwned: [],
        cannotAfford: [],
        totalPrograms: 0,
        ownedCount: 0,
        playerMoney,
        nextProgram: null,
        moneyUntilNext: Math.max(0, 200000 - playerMoney),
        hasTorRouter: false,
      });

      for (const line of lines) {
        ns.print(line);
      }

      if (playerMoney >= 200000) {
        const bought = purchaseTorRouter(ns);
        if (bought) {
          ns.tprint(`${COLORS.green}Purchased TOR Router!${COLORS.reset}`);
        }
      }
    } else {
      const result = analyzeDarkwebPrograms(ns);
      const lines = formatPurchaseResult(ns, result);

      for (const line of lines) {
        ns.print(line);
      }

      if (result.purchased.length > 0) {
        ns.tprint(
          `${COLORS.green}Purchased ${result.purchased.length} program(s): ${result.purchased.map((p) => p.name).join(", ")}${COLORS.reset}`
        );
      }

      // Exit if all programs are owned
      if (result.ownedCount === result.totalPrograms) {
        ns.tprint(`${COLORS.green}All darkweb programs owned - exiting.${COLORS.reset}`);
        return;
      }
    }

    if (!oneShot) {
      ns.print(
        `\n${COLORS.dim}Next check in ${interval / 1000}s...${COLORS.reset}`
      );
      await ns.sleep(interval);
    }
  } while (!oneShot);
}
