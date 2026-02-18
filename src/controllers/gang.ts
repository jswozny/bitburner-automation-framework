/**
 * Gang Controller - Pure Logic (0 RAM)
 *
 * All decision-making functions for gang management.
 * Zero NS imports - only uses data passed in as arguments.
 *
 * Import with: import { assignTasks, scoreAscension, ... } from '/controllers/gang';
 */
import { GangStrategy } from "/types/ports";

// === CONSTANTS ===

/** NATO phonetic alphabet names for gang members (max 12) */
export const NATO_NAMES = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot",
  "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima",
];

/** Respect threshold for switching from respect to money in balanced mode */
const BALANCED_RESPECT_THRESHOLD = 1_000_000;

// === TYPES ===

export interface TaskAssignment {
  memberName: string;
  task: string;
  reason: string;
}

export interface MemberInfo {
  name: string;
  task: string;
  str: number;
  def: number;
  dex: number;
  agi: number;
  cha: number;
  hack: number;
  earnedRespect: number;
}

export interface TaskStats {
  name: string;
  baseMoney: number;
  baseRespect: number;
  baseWanted: number;
  strWeight: number;
  defWeight: number;
  dexWeight: number;
  agiWeight: number;
  chaWeight: number;
  hackWeight: number;
  isHacking: boolean;
  isCombat: boolean;
}

export interface GangInfo {
  respect: number;
  wantedLevel: number;
  wantedPenalty: number;
  territory: number;
  isHacking: boolean;
}

export interface AscensionResult {
  str: number;
  def: number;
  dex: number;
  agi: number;
  cha: number;
  hack: number;
}

export interface EquipmentInfo {
  name: string;
  cost: number;
  type: string;
  stats: {
    str?: number;
    def?: number;
    dex?: number;
    agi?: number;
    cha?: number;
    hack?: number;
  };
}

// === FUNCTIONS ===

/**
 * Get the next unused NATO name for recruiting.
 */
export function getNextRecruitName(existingNames: string[]): string {
  const existing = new Set(existingNames);
  for (const name of NATO_NAMES) {
    if (!existing.has(name)) return name;
  }
  return `Member-${existingNames.length + 1}`;
}

/**
 * Calculate the total combat stats for a member.
 */
function totalCombatStats(m: MemberInfo): number {
  return m.str + m.def + m.dex + m.agi;
}

/**
 * Calculate member-task stat alignment score.
 * Higher score = member's stats better match task's stat weights.
 */
function memberTaskAlignment(m: MemberInfo, task: TaskStats): number {
  return (
    m.str * task.strWeight +
    m.def * task.defWeight +
    m.dex * task.dexWeight +
    m.agi * task.agiWeight +
    m.cha * task.chaWeight +
    m.hack * task.hackWeight
  );
}

/**
 * Select members for wanted cleanup (Vigilante Justice).
 * Returns weakest members by total stats. Count scales with deficit severity.
 */
export function selectWantedCleaners(
  members: MemberInfo[],
  threshold: number,
  currentPenalty: number,
): string[] {
  if (currentPenalty >= threshold) return [];

  // How far below threshold are we? Scale cleaners accordingly
  const deficit = threshold - currentPenalty;
  const severity = deficit / (1 - threshold); // 0-1 scale
  const cleanerCount = Math.max(1, Math.ceil(members.length * severity * 0.5));

  // Sort by total combat stats ascending (weakest first)
  const sorted = [...members].sort((a, b) => totalCombatStats(a) - totalCombatStats(b));
  return sorted.slice(0, cleanerCount).map(m => m.name);
}

/**
 * Assign tasks to all members based on strategy.
 * Respects pinned members and handles wanted cleanup.
 */
export function assignTasks(
  members: MemberInfo[],
  strategy: GangStrategy,
  gangInfo: GangInfo,
  taskStats: TaskStats[],
  pinnedMembers: Record<string, string>,
  wantedThreshold: number,
  trainingThreshold = 200,
): TaskAssignment[] {
  const assignments: TaskAssignment[] = [];
  const assigned = new Set<string>();

  // 1. Pinned members keep their tasks
  for (const member of members) {
    if (pinnedMembers[member.name]) {
      assignments.push({
        memberName: member.name,
        task: pinnedMembers[member.name],
        reason: "pinned",
      });
      assigned.add(member.name);
    }
  }

  // 2. Wanted cleanup - assign weakest unpinned members to Vigilante Justice
  const unpinned = members.filter(m => !assigned.has(m.name));
  if (gangInfo.wantedPenalty < wantedThreshold && gangInfo.wantedLevel > 1) {
    const cleaners = selectWantedCleaners(unpinned, wantedThreshold, gangInfo.wantedPenalty);
    for (const name of cleaners) {
      assignments.push({
        memberName: name,
        task: "Vigilante Justice",
        reason: `wanted cleanup (${(gangInfo.wantedPenalty * 100).toFixed(1)}% < ${(wantedThreshold * 100).toFixed(0)}%)`,
      });
      assigned.add(name);
    }
  }

  // 3. Remaining members get strategy-based tasks
  const remaining = members.filter(m => !assigned.has(m.name));
  const combatTasks = taskStats.filter(t => t.isCombat && t.name !== "Vigilante Justice" && t.name !== "Territory Warfare");
  const trainingTask = taskStats.find(t => t.name === "Train Combat");

  for (const member of remaining) {
    // New/weak members always train first
    const combatTotal = totalCombatStats(member);
    const trainingTarget = trainingThreshold * 4;
    if (combatTotal < trainingTarget && trainingTask) {
      assignments.push({
        memberName: member.name,
        task: trainingTask.name,
        reason: `training (${Math.round(combatTotal)}/${Math.round(trainingTarget)} combat stats)`,
      });
      continue;
    }

    const task = selectTaskForStrategy(member, strategy, gangInfo, combatTasks, taskStats);
    assignments.push(task);
  }

  return assignments;
}

/**
 * Select the best task for a member based on strategy.
 */
function selectTaskForStrategy(
  member: MemberInfo,
  strategy: GangStrategy,
  gangInfo: GangInfo,
  combatTasks: TaskStats[],
  allTasks: TaskStats[],
): TaskAssignment {
  switch (strategy) {
    case "respect":
      return selectBestTask(member, combatTasks, "respect");
    case "money":
      return selectBestTask(member, combatTasks, "money");
    case "territory":
      return {
        memberName: member.name,
        task: "Territory Warfare",
        reason: "territory strategy",
      };
    case "balanced": {
      const mode = gangInfo.respect < BALANCED_RESPECT_THRESHOLD ? "respect" : "money";
      return selectBestTask(member, combatTasks, mode);
    }
    default:
      return selectBestTask(member, combatTasks, "respect");
  }
}

/**
 * Select the best task for a member based on optimization target.
 */
function selectBestTask(
  member: MemberInfo,
  tasks: TaskStats[],
  optimize: "respect" | "money",
): TaskAssignment {
  if (tasks.length === 0) {
    return { memberName: member.name, task: "Train Combat", reason: "no tasks available" };
  }

  let bestTask = tasks[0];
  let bestScore = -Infinity;

  for (const task of tasks) {
    const alignment = memberTaskAlignment(member, task);
    const baseValue = optimize === "respect" ? task.baseRespect : task.baseMoney;
    const score = baseValue * alignment;
    if (score > bestScore) {
      bestScore = score;
      bestTask = task;
    }
  }

  return {
    memberName: member.name,
    task: bestTask.name,
    reason: `best ${optimize} (${bestTask.name})`,
  };
}

/**
 * Score an ascension result to determine action.
 */
export function scoreAscension(
  result: AscensionResult,
  autoThreshold: number,
  reviewThreshold: number,
): { action: "auto" | "flag" | "skip"; bestGain: number; bestStat: string } {
  const gains: [string, number][] = [
    ["str", result.str],
    ["def", result.def],
    ["dex", result.dex],
    ["agi", result.agi],
  ];

  // Find the best combat stat gain (multiplier, so >1 means improvement)
  const [bestStat, bestGain] = gains.reduce(
    (best, curr) => (curr[1] > best[1] ? curr : best),
    gains[0],
  );

  if (bestGain >= autoThreshold) {
    return { action: "auto", bestGain, bestStat };
  }
  if (bestGain >= reviewThreshold) {
    return { action: "flag", bestGain, bestStat };
  }
  return { action: "skip", bestGain, bestStat };
}

/**
 * Rank equipment by ROI for purchasing priority.
 * ROI = weighted stat delta / cost, using current task's stat weights.
 */
export function rankEquipment(
  equipment: EquipmentInfo[],
  currentTaskStats: TaskStats | null,
  ownedEquipment: Set<string>,
): { name: string; cost: number; roi: number }[] {
  const available = equipment.filter(e => !ownedEquipment.has(e.name));

  // Default weights if no current task
  const weights = {
    str: currentTaskStats?.strWeight ?? 0.25,
    def: currentTaskStats?.defWeight ?? 0.25,
    dex: currentTaskStats?.dexWeight ?? 0.25,
    agi: currentTaskStats?.agiWeight ?? 0.25,
    cha: currentTaskStats?.chaWeight ?? 0,
    hack: currentTaskStats?.hackWeight ?? 0,
  };

  return available
    .map(e => {
      const statDelta =
        (e.stats.str ?? 0) * weights.str +
        (e.stats.def ?? 0) * weights.def +
        (e.stats.dex ?? 0) * weights.dex +
        (e.stats.agi ?? 0) * weights.agi +
        (e.stats.cha ?? 0) * weights.cha +
        (e.stats.hack ?? 0) * weights.hack;
      const roi = e.cost > 0 ? statDelta / e.cost : 0;
      return { name: e.name, cost: e.cost, roi };
    })
    .sort((a, b) => b.roi - a.roi);
}
