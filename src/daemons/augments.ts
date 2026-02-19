/**
 * Augments Daemon
 *
 * Non-tiered daemon that computes augmentation purchase data independently
 * of the rep daemon. Publishes AugmentsStatus to port 16 for the dashboard.
 *
 * Usage:
 *   run daemons/augments.js
 *   run daemons/augments.js --one-shot
 *   run daemons/augments.js --interval 3000
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import {
  analyzeFactions,
  calculatePurchasePriority,
  AUG_COST_MULT,
  getOwnedAugs,
  getInstalledAugs,
  getPendingAugs,
  getNeuroFluxInfo,
  calculateNeuroFluxPurchasePlan,
  canDonateToFaction,
  calculateNFGDonatePurchasePlan,
  getSequentialPurchaseAugs,
} from "/controllers/factions";
import { publishStatus } from "/lib/ports";
import { STATUS_PORTS, AugmentsStatus } from "/types/ports";

function classifyAugTags(ns: NS, name: string, prereqs: string[]): string[] {
  const stats = ns.singularity.getAugmentationStats(name);
  const tags: string[] = [];

  const TAG_FIELDS: Record<string, (keyof typeof stats)[]> = {
    hacking: ["hacking", "hacking_exp", "hacking_chance", "hacking_speed", "hacking_money", "hacking_grow"],
    combat: ["strength", "defense", "dexterity", "agility", "strength_exp", "defense_exp", "dexterity_exp", "agility_exp"],
    charisma: ["charisma", "charisma_exp"],
    crime: ["crime_money", "crime_success"],
    hacknet: ["hacknet_node_money", "hacknet_node_purchase_cost", "hacknet_node_ram_cost", "hacknet_node_core_cost", "hacknet_node_level_cost"],
    bladeburner: ["bladeburner_max_stamina", "bladeburner_stamina_gain", "bladeburner_analysis", "bladeburner_success_chance"],
    rep: ["company_rep", "faction_rep"],
    work: ["work_money"],
  };

  for (const [tag, fields] of Object.entries(TAG_FIELDS)) {
    if (fields.some((f) => (stats[f] as number) !== 1)) {
      tags.push(tag);
    }
  }

  if (prereqs.length > 0) {
    tags.push("prereq");
  }

  return tags;
}

function computeAugmentsStatus(ns: NS): AugmentsStatus {
  const player = ns.getPlayer();
  const playerMoney = player.money;
  const ownedAugs = getOwnedAugs(ns);
  const installedAugs = getInstalledAugs(ns);
  const pendingAugs = getPendingAugs(ns);

  const factionData = analyzeFactions(ns, player, ownedAugs);
  const purchasePlan = calculatePurchasePriority(ns, factionData);

  // Sequential augs (Shadows of Anarchy, etc.)
  const sequentialAugs = getSequentialPurchaseAugs(ns, factionData, playerMoney);

  // NeuroFlux info
  const nfInfo = getNeuroFluxInfo(ns);
  const nfPlan = calculateNeuroFluxPurchasePlan(ns, playerMoney);
  const nfRepProgress =
    nfInfo.repRequired > 0
      ? Math.min(1, nfInfo.bestFactionRep / nfInfo.repRequired)
      : 0;
  const nfRepGap = Math.max(0, nfInfo.repRequired - nfInfo.bestFactionRep);
  const canDonate = nfInfo.bestFaction
    ? canDonateToFaction(ns, nfInfo.bestFaction)
    : false;
  const donatePlan = canDonate
    ? calculateNFGDonatePurchasePlan(ns, playerMoney)
    : null;

  // Current multiplier based on pending augs (flat, not rolling)
  const currentMultiplier = Math.pow(AUG_COST_MULT, pendingAugs.length);

  return {
    available: purchasePlan.map((item) => {
      const adjustedCost = Math.round(item.basePrice * currentMultiplier);
      return {
        name: item.name,
        faction: item.faction,
        baseCost: item.basePrice,
        adjustedCost,
        baseCostFormatted: ns.formatNumber(item.basePrice),
        adjustedCostFormatted: ns.formatNumber(adjustedCost),
        tags: classifyAugTags(ns, item.name, item.prereqs),
      };
    }),
    sequentialAugs: sequentialAugs.map((item) => ({
      faction: item.faction,
      augName: item.aug.name,
      cost: item.aug.basePrice,
      costFormatted: ns.formatNumber(item.aug.basePrice),
      canAfford: item.canAfford,
    })),
    neuroFlux: nfInfo.bestFaction
      ? {
          currentLevel: nfInfo.currentLevel,
          bestFaction: nfInfo.bestFaction,
          hasEnoughRep: nfInfo.hasEnoughRep,
          canPurchase: nfPlan.purchases > 0,
          currentRep: nfInfo.bestFactionRep,
          currentRepFormatted: ns.formatNumber(nfInfo.bestFactionRep),
          repRequired: nfInfo.repRequired,
          repRequiredFormatted: ns.formatNumber(nfInfo.repRequired),
          repProgress: nfRepProgress,
          repGap: nfRepGap,
          repGapFormatted: ns.formatNumber(nfRepGap),
          currentPrice: nfInfo.currentPrice,
          currentPriceFormatted: ns.formatNumber(nfInfo.currentPrice),
          purchasePlan:
            nfPlan.purchases > 0
              ? {
                  startLevel: nfPlan.startLevel,
                  endLevel: nfPlan.endLevel,
                  purchases: nfPlan.purchases,
                  totalCost: nfPlan.totalCost,
                  totalCostFormatted: ns.formatNumber(nfPlan.totalCost),
                }
              : null,
          canDonate,
          donationPlan:
            donatePlan && donatePlan.canExecute
              ? {
                  purchases: donatePlan.purchases,
                  totalDonationCost: donatePlan.totalDonationCost,
                  totalDonationCostFormatted: ns.formatNumber(donatePlan.totalDonationCost),
                  totalPurchaseCost: donatePlan.totalPurchaseCost,
                  totalPurchaseCostFormatted: ns.formatNumber(donatePlan.totalPurchaseCost),
                  totalCost: donatePlan.totalCost,
                  totalCostFormatted: ns.formatNumber(donatePlan.totalCost),
                }
              : null,
        }
      : null,
    pendingAugs: pendingAugs.length,
    installedAugs: installedAugs.length,
    playerMoney,
    playerMoneyFormatted: ns.formatNumber(playerMoney),
  };
}

function printStatus(ns: NS, status: AugmentsStatus): void {
  const C = COLORS;

  ns.print(`${C.cyan}=== Augments Daemon ===${C.reset}`);
  ns.print(
    `${C.dim}Pending: ${C.reset}${C.yellow}${status.pendingAugs}${C.reset}` +
      `  ${C.dim}|${C.reset}  ${C.dim}Installed: ${C.reset}${C.green}${status.installedAugs}${C.reset}` +
      `  ${C.dim}|${C.reset}  ${C.dim}Available: ${C.reset}${C.white}${status.available.length}${C.reset}`
  );

  if (status.available.length > 0) {
    const totalCost = status.available.reduce((sum, a) => sum + a.adjustedCost, 0);
    ns.print("");
    ns.print(
      `${C.cyan}PURCHASE ORDER${C.reset} ${C.dim}(${status.available.length} augs, $${ns.formatNumber(totalCost)} total)${C.reset}`
    );
    for (let i = 0; i < Math.min(status.available.length, 8); i++) {
      const item = status.available[i];
      ns.print(
        `  ${C.dim}${(i + 1).toString().padStart(2)}.${C.reset} ${C.white}${item.name.substring(0, 30).padEnd(30)}${C.reset} ${C.dim}$${item.adjustedCostFormatted}${C.reset}`
      );
    }
    if (status.available.length > 8) {
      ns.print(`  ${C.dim}... +${status.available.length - 8} more${C.reset}`);
    }
  }

  if (status.neuroFlux?.bestFaction) {
    ns.print("");
    ns.print(`${C.cyan}NFG${C.reset} Lv${status.neuroFlux.currentLevel} via ${status.neuroFlux.bestFaction}`);
    if (status.neuroFlux.purchasePlan) {
      ns.print(`  ${C.green}Can buy ${status.neuroFlux.purchasePlan.purchases} ($${status.neuroFlux.purchasePlan.totalCostFormatted})${C.reset}`);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["interval", 3000],
    ["one-shot", false],
  ]) as { interval: number; "one-shot": boolean; _: string[] };

  const interval = flags.interval;
  const oneShot = flags["one-shot"];

  // Check SF4 level
  const sf4Level = ns.getResetInfo().ownedSF.get(4) ?? 0;
  if (sf4Level === 0) {
    ns.tprint("WARN: Augments daemon requires SF4 (Singularity API)");
    return;
  }

  do {

    ns.clearLog();

    const status = computeAugmentsStatus(ns);
    publishStatus(ns, STATUS_PORTS.augments, status);
    printStatus(ns, status);

    if (!oneShot) {
      ns.print(`\n${COLORS.dim}Next check in ${interval / 1000}s...${COLORS.reset}`);
      await ns.sleep(interval);
    }
  } while (!oneShot);
}
