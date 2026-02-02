/**
 * Faction, Reputation, and Augmentation utilities
 *
 * Requires Singularity API (SF4)
 *
 * Import with: import { analyzeFactions, calculatePurchasePriority, ... } from '/lib/factions';
 */
import { NS, Player } from "@ns";

// === CONSTANTS ===

/** Augmentation cost multiplier after each purchase */
export const AUG_COST_MULT = 1.9;

/** Factions that don't support traditional work (hacking/field/security) */
export const NON_WORKABLE_FACTIONS = new Set([
  "Shadows of Anarchy",  // Infiltration only
  "Bladeburners",        // Bladeburner actions only
  "Church of the Machine God", // Special faction
]);

/**
 * Factions where augs must be purchased one at a time
 * (rep requirement increases after each purchase)
 */
export const SEQUENTIAL_PURCHASE_FACTIONS = new Set([
  "Shadows of Anarchy",
]);

// === TYPES ===

export interface AugmentationInfo {
  name: string;
  repReq: number;
  basePrice: number;
  prereqs: string[];
}

export interface FactionData {
  name: string;
  currentRep: number;
  favor: number;
  availableAugs: AugmentationInfo[];
  nextAugRepGap: number;
}

export interface PurchasePlanItem extends AugmentationInfo {
  faction: string;
  adjustedCost: number;
  multiplier: number;
}

export interface NextTarget {
  aug: AugmentationInfo;
  faction: FactionData;
  repGap: number;
}

// === CORE LOGIC ===

/**
 * Analyze all joined factions and their augmentations
 */
export function analyzeFactions(
  ns: NS,
  player: Player,
  ownedAugs: string[]
): FactionData[] {
  const factions = player.factions;
  const results: FactionData[] = [];

  for (const faction of factions) {
    const allAugs = ns.singularity.getAugmentationsFromFaction(faction);
    const currentRep = ns.singularity.getFactionRep(faction);
    const favor = ns.singularity.getFactionFavor(faction);

    // Filter to unowned augs (excluding NeuroFlux Governor), sorted by rep requirement
    const availableAugs: AugmentationInfo[] = allAugs
      .filter((aug) => !ownedAugs.includes(aug) && aug !== "NeuroFlux Governor")
      .map((aug) => ({
        name: aug,
        repReq: ns.singularity.getAugmentationRepReq(aug),
        basePrice: ns.singularity.getAugmentationPrice(aug),
        prereqs: ns.singularity.getAugmentationPrereq(aug),
      }))
      .filter((aug) => {
        // Check prereqs are met
        const prereqs = aug.prereqs || [];
        return prereqs.every((p) => ownedAugs.includes(p));
      })
      .sort((a, b) => a.repReq - b.repReq);

    results.push({
      name: faction,
      currentRep,
      favor,
      availableAugs,
      nextAugRepGap:
        availableAugs.length > 0
          ? availableAugs[0].repReq - currentRep
          : Infinity,
    });
  }

  return results;
}

/**
 * Find the next augmentation to target (smallest POSITIVE rep gap across all factions)
 * Only considers augs that aren't unlocked yet (gap > 0)
 */
export function findNextAugmentation(factionData: FactionData[]): NextTarget | null {
  let bestAug: AugmentationInfo | null = null;
  let bestFaction: FactionData | null = null;
  let smallestGap = Infinity;

  for (const faction of factionData) {
    for (const aug of faction.availableAugs) {
      const gap = aug.repReq - faction.currentRep;
      // Only consider augs we don't have rep for yet
      if (gap > 0 && gap < smallestGap) {
        smallestGap = gap;
        bestAug = aug;
        bestFaction = faction;
      }
    }
  }

  if (!bestFaction || !bestAug) return null;

  return {
    aug: bestAug,
    faction: bestFaction,
    repGap: smallestGap,
  };
}

/**
 * Find the next augmentation to target from WORKABLE factions only
 * Excludes factions like Shadows of Anarchy that can't be worked for
 */
export function findNextWorkableAugmentation(factionData: FactionData[]): NextTarget | null {
  let bestAug: AugmentationInfo | null = null;
  let bestFaction: FactionData | null = null;
  let smallestGap = Infinity;

  for (const faction of factionData) {
    // Skip non-workable factions
    if (NON_WORKABLE_FACTIONS.has(faction.name)) continue;

    for (const aug of faction.availableAugs) {
      const gap = aug.repReq - faction.currentRep;
      // Only consider augs we don't have rep for yet
      if (gap > 0 && gap < smallestGap) {
        smallestGap = gap;
        bestAug = aug;
        bestFaction = faction;
      }
    }
  }

  if (!bestFaction || !bestAug) return null;

  return {
    aug: bestAug,
    faction: bestFaction,
    repGap: smallestGap,
  };
}

/**
 * Get progress info for non-workable factions that have available augs
 */
export function getNonWorkableFactionProgress(factionData: FactionData[]): {
  faction: FactionData;
  nextAug: AugmentationInfo;
  progress: number;
}[] {
  const results: { faction: FactionData; nextAug: AugmentationInfo; progress: number }[] = [];

  for (const faction of factionData) {
    if (!NON_WORKABLE_FACTIONS.has(faction.name)) continue;

    // Find the next aug they need rep for
    const nextAug = faction.availableAugs.find(aug => aug.repReq > faction.currentRep);
    if (nextAug) {
      const progress = Math.min(1, faction.currentRep / nextAug.repReq);
      results.push({ faction, nextAug, progress });
    }
  }

  return results.sort((a, b) => b.progress - a.progress); // Most progress first
}

/**
 * Calculate optimal purchase priority across all factions
 * Only includes augs where we have the required reputation
 * Sorted by base price descending (most expensive first minimizes total cost)
 * Excludes factions that require sequential purchases (like Shadows of Anarchy)
 */
export function calculatePurchasePriority(
  ns: NS,
  factionData: FactionData[]
): PurchasePlanItem[] {
  // Gather all purchasable augs from all factions (only those with rep)
  const allAugs: (AugmentationInfo & { faction: string })[] = [];
  const seen = new Set<string>();

  for (const faction of factionData) {
    // Skip factions that require sequential purchases
    if (SEQUENTIAL_PURCHASE_FACTIONS.has(faction.name)) continue;

    for (const aug of faction.availableAugs) {
      if (seen.has(aug.name)) continue;
      seen.add(aug.name);

      // Only include augs we have rep for
      if (faction.currentRep >= aug.repReq) {
        allAugs.push({
          ...aug,
          faction: faction.name,
        });
      }
    }
  }

  // Sort by base price (descending - most expensive first minimizes total cost)
  // Example: $100m + $10m*1.9 = $119m vs $10m + $100m*1.9 = $200m
  allAugs.sort((a, b) => b.basePrice - a.basePrice);

  // Calculate adjusted costs with multiplier
  let multiplier = 1;
  const result: PurchasePlanItem[] = [];

  for (const aug of allAugs) {
    const adjustedCost = Math.round(aug.basePrice * multiplier);
    result.push({
      ...aug,
      adjustedCost,
      multiplier,
    });
    multiplier *= AUG_COST_MULT;
  }

  return result;
}

/**
 * Select best work type based on player skills
 */
export function selectBestWorkType(
  ns: NS,
  player: Player
): "hacking" | "field" | "security" {
  // Choose based on best stats
  const hacking = player.skills.hacking;
  const combat =
    (player.skills.strength +
      player.skills.defense +
      player.skills.dexterity +
      player.skills.agility) /
    4;
  const charisma = player.skills.charisma;

  // Hacking is usually best for rep gain if you have high hacking
  if (hacking > combat && hacking > charisma) {
    return "hacking";
  } else if (combat > charisma) {
    return "field";
  } else {
    return "field"; // Field work uses mixed stats
  }
}

/**
 * Get all owned augmentations (including pending)
 */
export function getOwnedAugs(ns: NS): string[] {
  return ns.singularity.getOwnedAugmentations(true);
}

/**
 * Get installed augmentations only
 */
export function getInstalledAugs(ns: NS): string[] {
  return ns.singularity.getOwnedAugmentations(false);
}

/**
 * Get pending augmentations (purchased but not installed)
 */
export function getPendingAugs(ns: NS): string[] {
  const owned = getOwnedAugs(ns);
  const installed = getInstalledAugs(ns);
  return owned.filter((a) => !installed.includes(a));
}

/**
 * Calculate how many augs from a purchase plan can be afforded
 */
export function getAffordableAugs(
  purchasePlan: PurchasePlanItem[],
  availableMoney: number
): (PurchasePlanItem & { runningTotal: number })[] {
  let runningTotal = 0;
  const affordable: (PurchasePlanItem & { runningTotal: number })[] = [];

  for (const aug of purchasePlan) {
    runningTotal += aug.adjustedCost;
    if (runningTotal <= availableMoney) {
      affordable.push({ ...aug, runningTotal });
    } else {
      break;
    }
  }

  return affordable;
}

// === SEQUENTIAL PURCHASE FACTIONS (e.g., Shadows of Anarchy) ===

export interface SequentialAugInfo {
  faction: string;
  aug: AugmentationInfo;
  canAfford: boolean;
}

/**
 * Get available augs from sequential-purchase factions (one at a time only)
 * Returns only the NEXT aug that can be purchased from each such faction
 */
export function getSequentialPurchaseAugs(
  ns: NS,
  factionData: FactionData[],
  playerMoney: number
): SequentialAugInfo[] {
  const results: SequentialAugInfo[] = [];

  for (const faction of factionData) {
    if (!SEQUENTIAL_PURCHASE_FACTIONS.has(faction.name)) continue;

    // Find the first aug we have rep for (they're sorted by rep requirement)
    const nextAug = faction.availableAugs.find(
      (aug) => faction.currentRep >= aug.repReq
    );

    if (nextAug) {
      results.push({
        faction: faction.name,
        aug: nextAug,
        canAfford: playerMoney >= nextAug.basePrice,
      });
    }
  }

  return results;
}

// === WORK STATUS ===

export interface FactionWorkStatus {
  /** Whether we're currently working for the target faction */
  isWorkingForFaction: boolean;
  /** Whether we're doing the optimal work type */
  isOptimalWork: boolean;
  /** The best work type for our stats */
  bestWorkType: "hacking" | "field" | "security";
  /** Current work type if working for faction, null otherwise */
  currentWorkType: string | null;
  /** Whether the target faction is workable (not infiltration-only etc) */
  isWorkable: boolean;
}

/**
 * Get the current work status for a target faction
 * Returns info about whether we're doing optimal work and what we should be doing
 */
export function getFactionWorkStatus(
  ns: NS,
  player: Player,
  targetFaction: string
): FactionWorkStatus {
  const isWorkable = !NON_WORKABLE_FACTIONS.has(targetFaction);
  const bestWorkType = selectBestWorkType(ns, player);
  const currentWork = ns.singularity.getCurrentWork();

  const isWorkingForFaction =
    currentWork?.type === "FACTION" &&
    currentWork?.factionName === targetFaction;

  const currentWorkType = isWorkingForFaction
    ? (currentWork as { factionWorkType?: string }).factionWorkType ?? null
    : null;

  const isOptimalWork = isWorkingForFaction && currentWorkType === bestWorkType;

  return {
    isWorkingForFaction,
    isOptimalWork,
    bestWorkType,
    currentWorkType,
    isWorkable,
  };
}

/**
 * Start optimal faction work with focus
 */
export function startOptimalFactionWork(
  ns: NS,
  player: Player,
  factionName: string
): boolean {
  if (NON_WORKABLE_FACTIONS.has(factionName)) {
    return false;
  }
  const bestWork = selectBestWorkType(ns, player);
  return ns.singularity.workForFaction(factionName, bestWork, true);
}
