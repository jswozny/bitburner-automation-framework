/**
 * Auto Work - Automated Training Script
 *
 * Automatically trains skills via gyms, universities, or crime based on focus.
 *
 * Run: run auto/auto-work.js                    (continuous mode)
 *      run auto/auto-work.js --focus strength   (set focus and run)
 *      run auto/auto-work.js --one-shot         (single execution)
 *      run auto/auto-work.js --interval 5000    (custom interval)
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import {
  setWorkFocus,
  getWorkStatus,
  runWorkCycle,
  getSkillDisplayName,
  WorkFocus,
  WorkStatus,
  TRAVEL_COST,
} from "/lib/work";

// Re-export types and functions for dashboard
export { getWorkStatus, WorkStatus };

// === DISPLAY ===

function formatWorkStatus(ns: NS, status: WorkStatus): string[] {
  const lines: string[] = [];

  lines.push(`${COLORS.cyan}═══ Auto Work ═══${COLORS.reset}`);
  lines.push(`Focus: ${COLORS.green}${status.currentFocus}${COLORS.reset}`);
  lines.push(`City: ${status.playerCity}`);
  lines.push(``);

  // Skills
  lines.push(`${COLORS.cyan}Skills:${COLORS.reset}`);
  lines.push(
    `  STR: ${ns.formatNumber(status.skills.strength, 0)}  DEF: ${ns.formatNumber(status.skills.defense, 0)}  DEX: ${ns.formatNumber(status.skills.dexterity, 0)}  AGI: ${ns.formatNumber(status.skills.agility, 0)}`
  );
  lines.push(
    `  HACK: ${ns.formatNumber(status.skills.hacking, 0)}  CHA: ${ns.formatNumber(status.skills.charisma, 0)}`
  );
  lines.push(``);

  // Current activity
  if (status.currentWork) {
    const workType = status.currentWork.type.toUpperCase();
    const location = status.currentWork.location ?? "";
    const stat = status.currentWork.stat ?? "";
    lines.push(`${COLORS.green}Current: ${workType}${COLORS.reset}`);
    if (location) lines.push(`  Location: ${location}`);
    if (stat) lines.push(`  Activity: ${stat}`);
  } else {
    lines.push(`${COLORS.yellow}Current: IDLE${COLORS.reset}`);
  }
  lines.push(``);

  // Recommended action
  if (status.recommendedAction) {
    const rec = status.recommendedAction;
    lines.push(`${COLORS.cyan}Recommended:${COLORS.reset}`);

    if (rec.type === "crime") {
      lines.push(`  Crime: ${rec.location}`);
      if (rec.skill === "money") {
        lines.push(`  $/min: ${ns.formatNumber(rec.expMult)}`);
      } else {
        lines.push(`  Combat exp/min: ${ns.formatNumber(rec.expMult)}`);
      }
    } else {
      lines.push(`  ${rec.type === "gym" ? "Gym" : "University"}: ${rec.location}`);
      lines.push(`  Skill: ${getSkillDisplayName(rec.skill)}`);
      lines.push(`  Exp mult: ${rec.expMult}x`);

      if (rec.needsTravel) {
        const canTravel = status.playerMoney >= TRAVEL_COST;
        const travelStatus = canTravel
          ? `${COLORS.green}Can travel ($${ns.formatNumber(TRAVEL_COST)})${COLORS.reset}`
          : `${COLORS.red}Need $${ns.formatNumber(TRAVEL_COST)} to travel${COLORS.reset}`;
        lines.push(`  Travel: ${travelStatus} to ${rec.city}`);
      }
    }
  }

  // Balance mode time tracking
  if (
    (status.currentFocus === "balance-combat" || status.currentFocus === "balance-all") &&
    Object.keys(status.skillTimeSpent).length > 0
  ) {
    lines.push(``);
    lines.push(`${COLORS.dim}Time spent per skill:${COLORS.reset}`);
    for (const [skill, time] of Object.entries(status.skillTimeSpent)) {
      const secs = Math.floor((time as number) / 1000);
      lines.push(`  ${getSkillDisplayName(skill)}: ${secs}s`);
    }
  }

  return lines;
}

// === MAIN ===

export async function main(ns: NS): Promise<void> {
  const FLAGS = ns.flags([
    ["focus", ""],
    ["interval", 5000],
    ["one-shot", false],
  ]) as {
    focus: string;
    interval: number;
    "one-shot": boolean;
    _: string[];
  };

  // Set focus if provided
  if (FLAGS.focus) {
    const validFocuses: WorkFocus[] = [
      "strength",
      "defense",
      "dexterity",
      "agility",
      "hacking",
      "charisma",
      "balance-all",
      "balance-combat",
      "crime-money",
      "crime-stats",
    ];

    if (validFocuses.includes(FLAGS.focus as WorkFocus)) {
      setWorkFocus(ns, FLAGS.focus as WorkFocus);
      ns.print(`${COLORS.green}Set focus to: ${FLAGS.focus}${COLORS.reset}`);
    } else {
      ns.tprint(`${COLORS.red}Invalid focus: ${FLAGS.focus}${COLORS.reset}`);
      ns.tprint(`Valid options: ${validFocuses.join(", ")}`);
      return;
    }
  }

  do {
    ns.clearLog();

    // Run training cycle
    const started = runWorkCycle(ns);
    if (!started) {
      ns.print(`${COLORS.yellow}Could not start training this cycle${COLORS.reset}`);
    }

    // Display status
    const status = getWorkStatus(ns);
    const lines = formatWorkStatus(ns, status);
    for (const line of lines) {
      ns.print(line);
    }

    if (!FLAGS["one-shot"]) {
      ns.print(``);
      ns.print(`${COLORS.dim}Next check in ${FLAGS.interval / 1000}s...${COLORS.reset}`);
      await ns.sleep(FLAGS.interval);
    }
  } while (!FLAGS["one-shot"]);
}
