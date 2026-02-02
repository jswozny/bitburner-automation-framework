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
  readWorkConfig,
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
  const C = COLORS;
  const lines: string[] = [];

  lines.push(`${C.cyan}═══ Auto Work ═══${C.reset}`);
  lines.push(`Focus: ${C.green}${status.currentFocus}${C.reset}`);
  lines.push(`City: ${status.playerCity}`);
  lines.push(``);

  // Skills
  lines.push(`${C.cyan}Skills:${C.reset}`);
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
    lines.push(`${C.green}Current: ${workType}${C.reset}`);
    if (location) lines.push(`  Location: ${location}`);
    if (stat) lines.push(`  Activity: ${stat}`);
  } else {
    lines.push(`${C.yellow}Current: IDLE${C.reset}`);
  }
  lines.push(``);

  // Recommended action
  if (status.recommendedAction) {
    const rec = status.recommendedAction;
    lines.push(`${C.cyan}Recommended:${C.reset}`);

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
          ? `${C.green}Can travel ($${ns.formatNumber(TRAVEL_COST)})${C.reset}`
          : `${C.red}Need $${ns.formatNumber(TRAVEL_COST)} to travel${C.reset}`;
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
    lines.push(`${C.dim}Time spent per skill:${C.reset}`);
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

  const C = COLORS;

  ns.disableLog("ALL");

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
      ns.print(`${C.green}Set focus to: ${FLAGS.focus}${C.reset}`);
    } else {
      ns.tprint(`${C.red}Invalid focus: ${FLAGS.focus}${C.reset}`);
      ns.tprint(`Valid options: ${validFocuses.join(", ")}`);
      return;
    }
  }

  if (!FLAGS["one-shot"]) {
    ns.ui.openTail();
  }

  do {
    ns.clearLog();

    // Run training cycle
    const started = runWorkCycle(ns);
    if (!started) {
      ns.print(`${C.yellow}Could not start training this cycle${C.reset}`);
    }

    // Display status
    const status = getWorkStatus(ns);
    const lines = formatWorkStatus(ns, status);
    for (const line of lines) {
      ns.print(line);
    }

    if (!FLAGS["one-shot"]) {
      ns.print(``);
      ns.print(`${C.dim}Next check in ${FLAGS.interval / 1000}s...${C.reset}`);
      await ns.sleep(FLAGS.interval);
    }
  } while (!FLAGS["one-shot"]);
}
