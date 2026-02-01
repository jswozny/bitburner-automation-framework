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
 * Calculate optimal purchase priority across all factions
 * Only includes augs where we have the required reputation
 * Sorted by base price descending (most expensive first minimizes total cost)
 */
export function calculatePurchasePriority(
  ns: NS,
  factionData: FactionData[]
): PurchasePlanItem[] {
  // Gather all purchasable augs from all factions (only those with rep)
  const allAugs: (AugmentationInfo & { faction: string })[] = [];
  const seen = new Set<string>();

  for (const faction of factionData) {
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
