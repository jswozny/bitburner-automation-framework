/**
 * Bladeburner Controller
 *
 * Pure logic for Bladeburner decision-making. Zero NS imports, zero RAM cost.
 * All functions receive data as arguments and return decisions.
 *
 * Import with: import { ... } from '/controllers/blade';
 */

// === TYPES ===

export interface BladeAction {
  type: "General" | "Contract" | "Operation" | "BlackOp";
  name: string;
}

export interface ActionData {
  name: string;
  successMin: number;
  successMax: number;
  count: number;
  time: number;
  rankGain: number;
}

export interface SkillData {
  name: string;
  level: number;
  upgradeCost: number;
}

export interface CityData {
  name: string;
  chaos: number;
  population: number;
  communities: number;
}

export interface BladeConfig {
  operationThreshold: number;   // min success % for operations (default 80)
  blackOpThreshold: number;     // min success % for black ops (default 95)
  contractThreshold: number;    // min success % for contracts (default 60)
  staminaMinPercent: number;    // % below which to rest (default 50)
  staminaTrainMax: number;      // max stamina threshold for training (default 400)
  chaosMax: number;             // chaos level that triggers diplomacy (default 50)
  chaosTarget: number;          // chaos level to reduce to (default 40)
  successSpreadMax: number;     // max success spread before field analysis (default 4)
  populationMin: number;        // min population before city switch (default 1_000_000)
}

export const DEFAULT_BLADE_CONFIG: BladeConfig = {
  operationThreshold: 80,
  blackOpThreshold: 95,
  contractThreshold: 60,
  staminaMinPercent: 50,
  staminaTrainMax: 0,
  chaosMax: 50,
  chaosTarget: 40,
  successSpreadMax: 4,
  populationMin: 1e9,
};

export interface BladeState {
  inBladeburner: boolean;
  rank: number;
  stamina: number;
  maxStamina: number;
  staminaPercent: number;
  skillPoints: number;
  city: string;
  cityChaos: number;
  cityPopulation: number;
  bonusTime: number;
  currentAction: BladeAction | null;

  // Analysis tier data (optional)
  contracts?: ActionData[];
  operations?: ActionData[];
  nextBlackOp?: { name: string; rankRequired: number; successMin: number; successMax: number } | null;
  skills?: SkillData[];
  cities?: CityData[];

  // Automation state
  isDiplomacyActive?: boolean;
}

// === CONSTANTS ===

export const BLADEBURNER_CITIES = [
  "Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima",
] as const;

/** Skill upgrade priority groups (earlier = higher priority) */
const SKILL_PRIORITY: { names: string[]; maxLevel?: number }[] = [
  { names: ["Blade's Intuition", "Digital Observer"] },
  { names: ["Reaper", "Evasive System"] },
  { names: ["Overclock"], maxLevel: 90 },
  { names: ["Cloak", "Short-Circuit"] },
  { names: ["Hyperdrive"] },
];

// === DECISION FUNCTIONS ===

/**
 * Select the best action to perform given current state.
 * Returns null if no valid action is available.
 */
export function selectAction(state: BladeState, config: BladeConfig): BladeAction | null {
  // Rest if stamina is low
  if (state.staminaPercent < config.staminaMinPercent) {
    return { type: "General", name: "Hyperbolic Regeneration Chamber" };
  }

  // Train if max stamina is low
  if (state.maxStamina < config.staminaTrainMax) {
    return { type: "General", name: "Training" };
  }

  // Diplomacy if chaos is high (or continue until target)
  if (state.cityChaos > config.chaosMax ||
      (state.isDiplomacyActive && state.cityChaos > config.chaosTarget)) {
    return { type: "General", name: "Diplomacy" };
  }

  // Need analysis-tier data for the rest of the decisions
  if (!state.contracts && !state.operations) {
    return { type: "General", name: "Field Analysis" };
  }

  // Black Op if available and conditions met
  if (state.nextBlackOp) {
    const bo = state.nextBlackOp;
    if (bo.rankRequired <= state.rank && bo.successMin >= config.blackOpThreshold) {
      return { type: "BlackOp", name: bo.name };
    }
  }

  // Best operation (by min success, filtered by threshold)
  const bestOp = selectBestAction(state.operations || [], config.operationThreshold);
  if (bestOp) {
    return { type: "Operation", name: bestOp.name };
  }

  // Best contract (by min success, filtered by threshold)
  const bestContract = selectBestAction(state.contracts || [], config.contractThreshold);
  if (bestContract) {
    return { type: "Contract", name: bestContract.name };
  }

  // Nothing met thresholds — Field Analysis to improve estimates
  return { type: "General", name: "Field Analysis" };
}

/**
 * Recommend the next skill to upgrade. Returns null if no skill is affordable.
 */
export function recommendSkillUpgrade(
  skills: SkillData[],
  skillPoints: number
): { name: string; cost: number } | null {
  const skillMap = new Map(skills.map(s => [s.name, s]));

  for (const group of SKILL_PRIORITY) {
    // Find the skill in this group with the lowest level (to alternate)
    let bestCandidate: SkillData | null = null;

    for (const name of group.names) {
      const skill = skillMap.get(name);
      if (!skill) continue;

      // Respect max level cap
      if (group.maxLevel !== undefined && skill.level >= group.maxLevel) continue;

      // Can we afford it?
      if (skill.upgradeCost > skillPoints) continue;

      // Pick the one with lowest level in this group
      if (!bestCandidate || skill.level < bestCandidate.level) {
        bestCandidate = skill;
      }
    }

    if (bestCandidate) {
      return { name: bestCandidate.name, cost: bestCandidate.upgradeCost };
    }
  }

  return null;
}

/**
 * Determine if the player should switch cities. Returns target city name or null.
 */
export function shouldSwitchCity(
  currentCity: string,
  cities: CityData[],
  populationMin: number
): string | null {
  const current = cities.find(c => c.name === currentCity);
  if (!current || current.population >= populationMin) return null;

  // Find city with highest population
  let best: CityData | null = null;
  for (const city of cities) {
    if (city.name === currentCity) continue;
    if (city.population < populationMin) continue;
    if (!best || city.population > best.population) {
      best = city;
    }
  }

  return best?.name ?? null;
}

// === HELPERS ===

/**
 * Select the best action from a list based on rank gain, filtered by success threshold.
 */
function selectBestAction(actions: ActionData[], minSuccess: number): ActionData | null {
  let best: ActionData | null = null;

  for (const action of actions) {
    if (action.count <= 0) continue;
    if (action.successMin < minSuccess) continue;
    if (!best || action.rankGain > best.rankGain) {
      best = action;
    }
  }

  return best;
}
