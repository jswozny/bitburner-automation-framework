/**
 * NeuroFlux Governor Purchase Script
 *
 * Bulk-purchases NeuroFlux Governor augmentations in optimal order.
 * Each purchase increases the price by 1.9x.
 *
 * Requires Singularity API (SF4)
 *
 * Run: run factions/neuroflux-purchase.js              (dry run - shows what would be bought)
 *      run factions/neuroflux-purchase.js --confirm    (actually purchase)
 *      run factions/neuroflux-purchase.js --reserve 1b (keep 1 billion in reserve)
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import {
  getNeuroFluxInfo,
  calculateNeuroFluxPurchasePlan,
  NeuroFluxPurchasePlan,
} from "/lib/factions";

// === TYPES ===

export interface PurchaseConfig {
  confirm: boolean;
  reserve: number;
}

export interface PurchaseResult {
  purchased: number;
  attempted: number;
  spent: number;
  failed: number;
}

// === CORE LOGIC ===

/**
 * Execute purchases for NeuroFlux Governor
 */
export async function executePurchases(
  ns: NS,
  plan: NeuroFluxPurchasePlan,
  faction: string
): Promise<PurchaseResult> {
  let purchased = 0;
  let spent = 0;
  let failed = 0;

  for (const item of plan.perPurchase) {
    const success = ns.singularity.purchaseAugmentation(faction, "NeuroFlux Governor");
    if (success) {
      ns.tprint(
        `${COLORS.green}✓${COLORS.reset} Purchased ${COLORS.white}NeuroFlux Governor${COLORS.reset} level ${COLORS.cyan}${item.level}${COLORS.reset} for ${COLORS.green}$${ns.formatNumber(item.cost)}${COLORS.reset}`
      );
      purchased++;
      spent += item.cost;
    } else {
      ns.tprint(
        `${COLORS.red}✗${COLORS.reset} Failed to purchase level ${item.level} - price may have changed`
      );
      failed++;
      break; // Stop on first failure since prices cascade
    }
    await ns.sleep(50); // Small delay between purchases
  }

  return { purchased, attempted: plan.purchases, spent, failed };
}

// === DISPLAY ===

/**
 * Display purchase plan header
 */
export function displayHeader(
  ns: NS,
  availableMoney: number,
  info: { currentLevel: number; bestFaction: string | null; bestFactionRep: number },
  confirm: boolean
): void {
  const C = COLORS;

  ns.tprint(`${C.cyan}${"═".repeat(70)}${C.reset}`);
  ns.tprint(
    `${" ".repeat(14)}${C.white}NEUROFLUX GOVERNOR PURCHASE${confirm ? "" : " (DRY RUN)"}${C.reset}`
  );
  ns.tprint(`${C.cyan}${"═".repeat(70)}${C.reset}`);
  ns.tprint(
    `${C.dim}Available: $${ns.formatNumber(availableMoney)} | Current Level: ${info.currentLevel} | Best Faction: ${info.bestFaction ?? "None"} (rep: ${ns.formatNumber(info.bestFactionRep)})${C.reset}`
  );
  ns.tprint("");
}

/**
 * Display the purchase plan table
 */
export function displayPurchasePlan(
  ns: NS,
  plan: NeuroFluxPurchasePlan
): void {
  const C = COLORS;

  ns.tprint(
    `${C.white}Can purchase levels ${plan.startLevel} → ${plan.endLevel} (${plan.purchases} upgrades) for ${C.green}$${ns.formatNumber(plan.totalCost)}${C.reset}`
  );
  ns.tprint("");

  ns.tprint(
    `${C.dim}${"#".padStart(2)} ${"Level".padStart(5)}       ${"Cost".padStart(12)}      ${"Running Total".padStart(14)}${C.reset}`
  );
  ns.tprint(`${C.dim}${"─".repeat(50)}${C.reset}`);

  let runningTotal = 0;
  for (let i = 0; i < plan.perPurchase.length; i++) {
    const item = plan.perPurchase[i];
    runningTotal += item.cost;
    ns.tprint(
      `${C.green}${(i + 1).toString().padStart(2)}${C.reset}   ` +
        `${C.white}${item.level.toString().padStart(5)}${C.reset}    ` +
        `${C.green}$${ns.formatNumber(item.cost).padStart(11)}${C.reset}         ` +
        `${C.cyan}$${ns.formatNumber(runningTotal).padStart(11)}${C.reset}`
    );
  }

  ns.tprint(`${C.dim}${"─".repeat(50)}${C.reset}`);
}

// === RUNNER ===

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ["confirm", false],
    ["reserve", 0],
  ]) as {
    confirm: boolean;
    reserve: number;
    _: string[];
  };

  const config: PurchaseConfig = {
    confirm: flags.confirm,
    reserve: flags.reserve,
  };

  const C = COLORS;
  const player = ns.getPlayer();
  const availableMoney = player.money - config.reserve;

  // Get NeuroFlux info and calculate purchase plan
  const info = getNeuroFluxInfo(ns);

  if (!info.bestFaction) {
    ns.tprint(`${C.yellow}No faction with NeuroFlux Governor available.${C.reset}`);
    ns.tprint(`${C.dim}Join a faction that offers NeuroFlux Governor augmentation.${C.reset}`);
    return;
  }

  if (!info.hasEnoughRep) {
    ns.tprint(`${C.yellow}Not enough reputation to purchase NeuroFlux Governor.${C.reset}`);
    ns.tprint(
      `${C.dim}Need ${ns.formatNumber(info.repRequired)} rep, have ${ns.formatNumber(info.bestFactionRep)} with ${info.bestFaction}.${C.reset}`
    );
    return;
  }

  const plan = calculateNeuroFluxPurchasePlan(ns, availableMoney);

  // Display header
  displayHeader(ns, availableMoney, info, config.confirm);

  if (plan.purchases === 0) {
    ns.tprint(`${C.yellow}Cannot afford any NeuroFlux Governor upgrades.${C.reset}`);
    ns.tprint(
      `${C.dim}Next level costs $${ns.formatNumber(info.currentPrice)}${C.reset}`
    );
    return;
  }

  // Display purchase plan
  displayPurchasePlan(ns, plan);

  ns.tprint("");

  // Execute purchases if confirmed
  if (!config.confirm) {
    ns.tprint(`${C.yellow}DRY RUN - No purchases made.${C.reset}`);
    ns.tprint(`${C.dim}Run with --confirm to actually purchase.${C.reset}`);
    return;
  }

  ns.tprint(`${C.cyan}Purchasing NeuroFlux Governor upgrades...${C.reset}`);
  ns.tprint("");

  const result = await executePurchases(ns, plan, info.bestFaction);

  ns.tprint("");
  ns.tprint(`${C.cyan}${"═".repeat(70)}${C.reset}`);
  ns.tprint(
    `${C.white}Purchased ${C.green}${result.purchased}${C.reset}/${result.attempted} upgrades for ~$${ns.formatNumber(result.spent)}${C.reset}`
  );

  if (result.purchased > 0) {
    ns.tprint("");
    ns.tprint(`${C.yellow}Remember to install augmentations when ready:${C.reset}`);
    ns.tprint(
      `${C.dim}ns.singularity.installAugmentations() or use the Augmentations menu${C.reset}`
    );
  }
}
