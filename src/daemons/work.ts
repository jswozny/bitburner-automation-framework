/**
 * Work Daemon
 *
 * Long-running daemon that automatically trains skills via gyms,
 * universities, or crime based on the configured focus. Publishes
 * WorkStatus to the status port for the dashboard.
 *
 * Wraps the logic from auto/auto-work.ts with port-based status publishing.
 *
 * Usage:
 *   run daemons/work.js
 *   run daemons/work.js --focus strength
 *   run daemons/work.js --one-shot
 *   run daemons/work.js --interval 5000
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import {
  setWorkFocus,
  getWorkStatus,
  runWorkCycle,
  getSkillDisplayName,
  WorkFocus,
  TRAVEL_COST,
} from "/controllers/work";
import { analyzeCrime, CrimeName } from "/controllers/crime";
import { publishStatus } from "/lib/ports";
import { STATUS_PORTS, WorkStatus } from "/types/ports";
import { writeDefaultConfig, getConfigString, getConfigNumber, getConfigBool } from "/lib/config";

// === FOCUS OPTIONS (mirrors dashboard/tools/work.tsx) ===

const FOCUS_OPTIONS: { value: WorkFocus; label: string }[] = [
  { value: "strength", label: "Strength" },
  { value: "defense", label: "Defense" },
  { value: "dexterity", label: "Dexterity" },
  { value: "agility", label: "Agility" },
  { value: "hacking", label: "Hacking" },
  { value: "charisma", label: "Charisma" },
  { value: "balance-combat", label: "Balance Combat" },
  { value: "balance-all", label: "Balance All" },
  { value: "crime-money", label: "Crime (Money)" },
  { value: "crime-stats", label: "Crime (Stats)" },
  { value: "crime-karma", label: "Crime (Karma)" },
  { value: "crime-kills", label: "Crime (Kills)" },
];

/**
 * Compute the formatted WorkStatus for dashboard consumption
 */
function computeWorkStatus(ns: NS): WorkStatus {
  const rawStatus = getWorkStatus(ns);

  // Check if player is focused on current work
  const isFocused = ns.singularity.isFocused();

  // Calculate combat stat range
  const combatStats = [
    rawStatus.skills.strength,
    rawStatus.skills.defense,
    rawStatus.skills.dexterity,
    rawStatus.skills.agility,
  ];
  const lowestCombat = Math.min(...combatStats);
  const highestCombat = Math.max(...combatStats);

  // Determine current activity display and type
  let activityDisplay = "Idle";
  let activityType: "gym" | "university" | "crime" | "idle" | "other" = "idle";
  const focusedSuffix = isFocused ? " (focused)" : "";

  if (rawStatus.currentWork) {
    if (rawStatus.currentWork.type === "class") {
      const stat = rawStatus.currentWork.stat ?? "";
      if (stat.toLowerCase().includes("gym")) {
        activityType = "gym";
        activityDisplay = `Gym: ${stat}`;
      } else {
        activityType = "university";
        activityDisplay = `University: ${stat}`;
      }
      if (rawStatus.currentWork.location) {
        activityDisplay += ` @ ${rawStatus.currentWork.location}`;
      }
      activityDisplay += focusedSuffix;
    } else if (rawStatus.currentWork.type === "crime") {
      activityType = "crime";
      activityDisplay = `Crime: ${rawStatus.currentWork.stat ?? "Unknown"}${focusedSuffix}`;
    } else {
      activityType = "other";
      activityDisplay = rawStatus.currentWork.type + focusedSuffix;
    }
  }

  // Build formatted recommendation
  const recommendation = rawStatus.recommendedAction
    ? {
        type: rawStatus.recommendedAction.type as "gym" | "university" | "crime",
        location: rawStatus.recommendedAction.location,
        city: rawStatus.recommendedAction.city,
        skill: rawStatus.recommendedAction.skill,
        skillDisplay: getSkillDisplayName(rawStatus.recommendedAction.skill),
        expMult: rawStatus.recommendedAction.expMult,
        expMultFormatted: rawStatus.recommendedAction.type === "crime"
          ? ns.formatNumber(rawStatus.recommendedAction.expMult)
          : `${rawStatus.recommendedAction.expMult}x`,
        needsTravel: rawStatus.recommendedAction.needsTravel,
        travelCost: rawStatus.recommendedAction.travelCost,
        travelCostFormatted: ns.formatNumber(TRAVEL_COST),
      }
    : null;

  // Build formatted balance rotation
  const balanceRotation = rawStatus.balanceRotation
    ? {
        currentSkill: rawStatus.balanceRotation.currentSkill,
        currentSkillDisplay: getSkillDisplayName(rawStatus.balanceRotation.currentSkill),
        currentValue: rawStatus.balanceRotation.currentValue,
        currentValueFormatted: ns.formatNumber(rawStatus.balanceRotation.currentValue, 0),
        lowestSkill: rawStatus.balanceRotation.lowestSkill,
        lowestSkillDisplay: getSkillDisplayName(rawStatus.balanceRotation.lowestSkill),
        lowestValue: rawStatus.balanceRotation.lowestValue,
        lowestValueFormatted: ns.formatNumber(rawStatus.balanceRotation.lowestValue, 0),
        timeSinceSwitch: rawStatus.balanceRotation.timeSinceSwitch,
        timeUntilEligible: rawStatus.balanceRotation.timeUntilEligible,
        timeUntilEligibleFormatted: rawStatus.balanceRotation.timeUntilEligible > 0
          ? `${Math.ceil(rawStatus.balanceRotation.timeUntilEligible / 1000)}s`
          : "Ready",
        canSwitch: rawStatus.balanceRotation.canSwitch,
        isTrainingLowest: rawStatus.balanceRotation.isTrainingLowest,
        skillValues: rawStatus.balanceRotation.skillValues.map(sv => ({
          skill: sv.skill,
          display: getSkillDisplayName(sv.skill),
          value: sv.value,
          valueFormatted: ns.formatNumber(sv.value, 0),
        })),
      }
    : null;

  // Build formatted crime info
  const crimeInfo = rawStatus.currentCrime
    ? {
        name: rawStatus.currentCrime.crime,
        chance: rawStatus.currentCrime.chance,
        chanceFormatted: `${(rawStatus.currentCrime.chance * 100).toFixed(1)}%`,
        moneyPerMin: rawStatus.currentCrime.moneyPerMin,
        moneyPerMinFormatted: ns.formatNumber(rawStatus.currentCrime.moneyPerMin),
        combatExpPerMin:
          rawStatus.currentCrime.strExpPerMin +
          rawStatus.currentCrime.defExpPerMin +
          rawStatus.currentCrime.dexExpPerMin +
          rawStatus.currentCrime.agiExpPerMin,
        karmaPerMin: rawStatus.currentCrime.karmaPerMin,
        karmaPerMinFormatted: ns.formatNumber(Math.abs(rawStatus.currentCrime.karmaPerMin)),
        killsPerMin: rawStatus.currentCrime.killsPerMin,
        killsPerMinFormatted: ns.formatNumber(rawStatus.currentCrime.killsPerMin),
      }
    : null;

  // Detect pending crime switch
  let pendingCrimeSwitch: WorkStatus["pendingCrimeSwitch"] = null;
  const isCrimeMode = rawStatus.currentFocus === "crime-money" || rawStatus.currentFocus === "crime-stats"
    || rawStatus.currentFocus === "crime-karma" || rawStatus.currentFocus === "crime-kills";
  if (isCrimeMode && rawStatus.currentWork?.type === "crime" && rawStatus.currentCrime) {
    const runningCrimeName = rawStatus.currentWork.stat;
    const bestCrimeName = rawStatus.currentCrime.crime;
    if (runningCrimeName && runningCrimeName !== bestCrimeName) {
      const runningAnalysis = analyzeCrime(ns, runningCrimeName as CrimeName);

      const getCrimeMetric = (analysis: typeof runningAnalysis): { value: number; metric: string } => {
        switch (rawStatus.currentFocus) {
          case "crime-money":
            return { value: analysis.moneyPerMin, metric: "$/min" };
          case "crime-stats":
            return {
              value: analysis.strExpPerMin + analysis.defExpPerMin +
                analysis.dexExpPerMin + analysis.agiExpPerMin,
              metric: "combat exp/min",
            };
          case "crime-karma":
            return { value: Math.abs(analysis.karmaPerMin), metric: "karma/min" };
          case "crime-kills":
            return { value: analysis.killsPerMin, metric: "kills/min" };
          default:
            return { value: analysis.moneyPerMin, metric: "$/min" };
        }
      };

      const current = getCrimeMetric(runningAnalysis);
      const best = getCrimeMetric(rawStatus.currentCrime);

      pendingCrimeSwitch = {
        currentCrime: runningCrimeName,
        bestCrime: bestCrimeName,
        currentValue: current.value,
        bestValue: best.value,
        currentValueFormatted: ns.formatNumber(current.value),
        bestValueFormatted: ns.formatNumber(best.value),
        metric: current.metric,
      };
    }
  }

  // Build formatted skill time spent
  const skillTimeSpent = Object.entries(rawStatus.skillTimeSpent).map(([skill, time]) => ({
    skill,
    skillDisplay: getSkillDisplayName(skill),
    timeMs: time as number,
    timeFormatted: `${Math.floor((time as number) / 1000)}s`,
  }));

  // Find the focus label
  const focusLabel = FOCUS_OPTIONS.find(f => f.value === rawStatus.currentFocus)?.label ?? rawStatus.currentFocus;

  return {
    currentFocus: rawStatus.currentFocus,
    focusLabel,
    playerCity: rawStatus.playerCity,
    playerMoney: rawStatus.playerMoney,
    playerMoneyFormatted: ns.formatNumber(rawStatus.playerMoney),
    isFocused,
    skills: {
      strength: rawStatus.skills.strength,
      defense: rawStatus.skills.defense,
      dexterity: rawStatus.skills.dexterity,
      agility: rawStatus.skills.agility,
      hacking: rawStatus.skills.hacking,
      charisma: rawStatus.skills.charisma,
      strengthFormatted: ns.formatNumber(rawStatus.skills.strength, 0),
      defenseFormatted: ns.formatNumber(rawStatus.skills.defense, 0),
      dexterityFormatted: ns.formatNumber(rawStatus.skills.dexterity, 0),
      agilityFormatted: ns.formatNumber(rawStatus.skills.agility, 0),
      hackingFormatted: ns.formatNumber(rawStatus.skills.hacking, 0),
      charismaFormatted: ns.formatNumber(rawStatus.skills.charisma, 0),
    },
    activityDisplay,
    activityType,
    isTraining: rawStatus.isTraining,
    recommendation,
    canTravelToBest: rawStatus.canTravelToBest,
    skillTimeSpent,
    lowestCombatStat: lowestCombat,
    highestCombatStat: highestCombat,
    combatBalance: highestCombat > 0 ? lowestCombat / highestCombat : 1,
    balanceRotation,
    crimeInfo,
    pendingCrimeSwitch,
  };
}

/**
 * Print formatted work status to the script log
 */
function printStatus(ns: NS, status: WorkStatus): void {
  const C = COLORS;

  ns.print(`${C.cyan}=== Work Daemon ===${C.reset}`);
  ns.print(
    `${C.dim}Focus:${C.reset} ${C.green}${status.focusLabel}${C.reset}` +
    `  ${C.dim}|${C.reset}  ${C.dim}City:${C.reset} ${C.white}${status.playerCity}${C.reset}` +
    `  ${C.dim}|${C.reset}  ${C.green}$${status.playerMoneyFormatted}${C.reset}`
  );
  ns.print("");

  // Skills
  ns.print(`${C.cyan}Skills:${C.reset}`);
  ns.print(
    `  ${C.yellow}STR:${C.reset} ${status.skills.strengthFormatted}  ` +
    `${C.yellow}DEF:${C.reset} ${status.skills.defenseFormatted}  ` +
    `${C.yellow}DEX:${C.reset} ${status.skills.dexterityFormatted}  ` +
    `${C.yellow}AGI:${C.reset} ${status.skills.agilityFormatted}`
  );
  ns.print(
    `  ${C.blue}HACK:${C.reset} ${status.skills.hackingFormatted}  ` +
    `${C.magenta}CHA:${C.reset} ${status.skills.charismaFormatted}`
  );
  ns.print("");

  // Current activity
  const activityColor = status.activityType === "gym" ? C.yellow
    : status.activityType === "university" ? C.blue
    : status.activityType === "crime" ? C.red
    : C.dim;
  ns.print(`${C.dim}Activity:${C.reset} ${activityColor}${status.activityDisplay}${C.reset}`);

  // Pending crime switch
  if (status.pendingCrimeSwitch) {
    const s = status.pendingCrimeSwitch;
    ns.print(
      `${C.yellow}Switching: ${s.currentCrime} → ${s.bestCrime}${C.reset}` +
      `  ${C.dim}(${s.currentValueFormatted} → ${s.bestValueFormatted} ${s.metric})${C.reset}`
    );
  }

  // Recommendation
  if (status.recommendation) {
    ns.print("");
    ns.print(`${C.cyan}Recommended:${C.reset}`);
    if (status.recommendation.type === "crime") {
      ns.print(`  ${C.white}${status.recommendation.location}${C.reset}`);
      if (status.crimeInfo) {
        ns.print(
          `  ${C.dim}Success:${C.reset} ${status.crimeInfo.chanceFormatted}` +
          `  ${C.dim}$/min:${C.reset} ${C.green}${status.crimeInfo.moneyPerMinFormatted}${C.reset}`
        );
      }
    } else {
      ns.print(
        `  ${C.white}${status.recommendation.location}${C.reset}` +
        `  ${C.dim}(${status.recommendation.skillDisplay}, ${status.recommendation.expMultFormatted})${C.reset}`
      );
      if (status.recommendation.needsTravel) {
        const canTravel = status.canTravelToBest;
        ns.print(
          `  ${canTravel ? C.green : C.red}Travel to ${status.recommendation.city}${C.reset}` +
          ` ${C.dim}($${status.recommendation.travelCostFormatted})${C.reset}`
        );
      }
    }
  }

  // Balance rotation info
  if (status.balanceRotation) {
    ns.print("");
    ns.print(`${C.cyan}Balance Rotation:${C.reset}`);
    ns.print(
      `  ${C.dim}Training:${C.reset} ${C.white}${status.balanceRotation.currentSkillDisplay}${C.reset}` +
      ` (${status.balanceRotation.currentValueFormatted})`
    );
    if (!status.balanceRotation.isTrainingLowest) {
      ns.print(
        `  ${C.dim}Lowest:${C.reset} ${C.yellow}${status.balanceRotation.lowestSkillDisplay}${C.reset}` +
        ` (${status.balanceRotation.lowestValueFormatted})` +
        `  ${C.dim}Switch in:${C.reset} ${status.balanceRotation.timeUntilEligibleFormatted}`
      );
    } else {
      ns.print(`  ${C.green}Training lowest skill${C.reset}`);
    }
  }

  // Skill time tracking
  if (status.skillTimeSpent.length > 0) {
    ns.print("");
    ns.print(`${C.dim}Time per skill:${C.reset}`);
    for (const entry of status.skillTimeSpent) {
      ns.print(`  ${C.dim}${entry.skillDisplay}:${C.reset} ${entry.timeFormatted}`);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  writeDefaultConfig(ns, "work", {
    focus: "",
    interval: "5000",
    oneShot: "false",
  });

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
    "crime-karma",
    "crime-kills",
  ];

  // Set focus from config on startup
  const initialFocus = getConfigString(ns, "work", "focus", "");
  if (initialFocus) {
    if (validFocuses.includes(initialFocus as WorkFocus)) {
      setWorkFocus(ns, initialFocus as WorkFocus);
      ns.print(`${COLORS.green}Set focus to: ${initialFocus}${COLORS.reset}`);
    } else {
      ns.tprint(`${COLORS.red}Invalid focus in config: ${initialFocus}${COLORS.reset}`);
      ns.tprint(`Valid options: ${validFocuses.join(", ")}`);
      return;
    }
  }

  do {
    const interval = getConfigNumber(ns, "work", "interval", 5000);
    const oneShot = getConfigBool(ns, "work", "oneShot", false);

    // Re-read focus each cycle for live editing
    const focus = getConfigString(ns, "work", "focus", "");
    if (focus && validFocuses.includes(focus as WorkFocus)) {
      setWorkFocus(ns, focus as WorkFocus);
    }
    ns.clearLog();

    // Run training cycle (start/continue appropriate training)
    const started = runWorkCycle(ns);
    if (!started) {
      ns.print(`${COLORS.yellow}Could not start training this cycle${COLORS.reset}`);
    }

    // Compute formatted status for dashboard
    const workStatus = computeWorkStatus(ns);

    // Publish to port
    publishStatus(ns, STATUS_PORTS.work, workStatus);

    // Print terminal display
    printStatus(ns, workStatus);

    if (!oneShot) {
      ns.print(`\n${COLORS.dim}Next check in ${interval / 1000}s...${COLORS.reset}`);
      await ns.sleep(interval);
    }
  } while (!getConfigBool(ns, "work", "oneShot", false));
}
