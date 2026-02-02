/**
 * Augmentation Purchase Script
 *
 * Purchases all unlocked augmentations in optimal order (most expensive first)
 * to minimize total cost due to the 1.9x price multiplier.
 *
 * Requires Singularity API (SF4)
 *
 * Run: run factions/rep-purchase.js              (dry run - shows what would be bought)
 *      run factions/rep-purchase.js --confirm    (actually purchase)
 *      run factions/rep-purchase.js --reserve 1b (keep 1 billion in reserve)
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import {
  PurchasePlanItem,
  analyzeFactions,
  calculatePurchasePriority,
  getOwnedAugs,
  getAffordableAugs,
  getSequentialPurchaseAugs,
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
  failed: string[];
}

// === CORE LOGIC ===

/**
 * Execute purchases for all affordable augmentations
 */
export async function executePurchases(
  ns: NS,
  affordable: (PurchasePlanItem & { runningTotal: number })[]
): Promise<PurchaseResult> {
  let purchased = 0;
  let spent = 0;
  const failed: string[] = [];

  for (const aug of affordable) {
    const success = ns.singularity.purchaseAugmentation(aug.faction, aug.name);
    if (success) {
      ns.tprint(
        `${COLORS.green}✓${COLORS.reset} Purchased ${COLORS.white}${aug.name}${COLORS.reset} from ${COLORS.cyan}${aug.faction}${COLORS.reset}`
      );
      purchased++;
      spent += aug.adjustedCost;
    } else {
      ns.tprint(
        `${COLORS.red}✗${COLORS.reset} Failed to purchase ${aug.name} - may need prereqs or price changed`
      );
      failed.push(aug.name);
    }
    await ns.sleep(50); // Small delay between purchases
  }

  return { purchased, attempted: affordable.length, spent, failed };
}

// === DISPLAY ===

/**
 * Display purchase plan header
 */
export function displayHeader(
  ns: NS,
  availableMoney: number,
  purchasePlan: PurchasePlanItem[],
  affordableCount: number,
  confirm: boolean
): void {
  const C = COLORS;

  ns.tprint(`${C.cyan}${"═".repeat(70)}${C.reset}`);
  ns.tprint(
    `${" ".repeat(20)}${C.white}AUGMENTATION PURCHASE${confirm ? "" : " (DRY RUN)"}${C.reset}`
  );
  ns.tprint(`${C.cyan}${"═".repeat(70)}${C.reset}`);
  ns.tprint(
    `${C.dim}Available: $${ns.formatNumber(availableMoney)} | Unlocked: ${purchasePlan.length} augs | Affordable: ${affordableCount} augs${C.reset}`
  );
  ns.tprint("");
}

/**
 * Display the purchase plan table
 */
export function displayPurchasePlan(
  ns: NS,
  affordable: (PurchasePlanItem & { runningTotal: number })[]
): void {
  const C = COLORS;

  ns.tprint(
    `${C.dim}${"#".padStart(2)} ${"Augmentation".padEnd(35)} ${"Faction".padEnd(18)} ${"Cost".padStart(12)}${C.reset}`
  );
  ns.tprint(`${C.dim}${"─".repeat(70)}${C.reset}`);

  for (let i = 0; i < affordable.length; i++) {
    const aug = affordable[i];
    ns.tprint(
      `${C.green}${(i + 1).toString().padStart(2)}${C.reset} ` +
        `${C.white}${aug.name.substring(0, 35).padEnd(35)}${C.reset} ` +
        `${C.cyan}${aug.faction.substring(0, 18).padEnd(18)}${C.reset} ` +
        `${C.green}$${ns.formatNumber(aug.adjustedCost).padStart(11)}${C.reset}`
    );
  }

  ns.tprint(`${C.dim}${"─".repeat(70)}${C.reset}`);
  ns.tprint(
    `${C.white}Total: ${C.green}$${ns.formatNumber(affordable[affordable.length - 1].runningTotal)}${C.reset} for ${C.green}${affordable.length}${C.reset} augmentations`
  );
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
  const ownedAugs = getOwnedAugs(ns);
  const availableMoney = player.money - config.reserve;

  // Get all faction data and calculate purchase plan
  const factionData = analyzeFactions(ns, player, ownedAugs);
  const purchasePlan = calculatePurchasePriority(ns, factionData);

  if (purchasePlan.length === 0) {
    ns.tprint(`${C.yellow}No augmentations unlocked for purchase.${C.reset}`);
    ns.tprint(`${C.dim}Earn more reputation to unlock augmentations first.${C.reset}`);
    return;
  }

  // Calculate what we can afford
  const affordable = getAffordableAugs(purchasePlan, availableMoney);

  // Display header
  displayHeader(ns, availableMoney, purchasePlan, affordable.length, config.confirm);

  if (affordable.length === 0) {
    ns.tprint(`${C.yellow}Cannot afford any augmentations.${C.reset}`);
    ns.tprint(
      `${C.dim}Cheapest unlocked aug costs $${ns.formatNumber(purchasePlan[0]?.adjustedCost || 0)}${C.reset}`
    );
    return;
  }

  // Display purchase plan
  displayPurchasePlan(ns, affordable);

  if (affordable.length < purchasePlan.length) {
    const remaining = purchasePlan.length - affordable.length;
    ns.tprint(
      `${C.yellow}${remaining} more aug${remaining > 1 ? "s" : ""} unlocked but not affordable${C.reset}`
    );
  }

  // Check for sequential purchase augs (Shadows of Anarchy, etc.)
  const sequentialAugs = getSequentialPurchaseAugs(ns, factionData, availableMoney);
  if (sequentialAugs.length > 0) {
    ns.tprint("");
    ns.tprint(`${C.magenta}${"─".repeat(70)}${C.reset}`);
    ns.tprint(`${C.magenta}SEQUENTIAL PURCHASE ONLY (one at a time)${C.reset}`);
    for (const item of sequentialAugs) {
      const affordStr = item.canAfford
        ? `${C.green}✓ Can afford${C.reset}`
        : `${C.red}✗ Need $${ns.formatNumber(item.aug.basePrice)}${C.reset}`;
      ns.tprint(
        `  ${C.white}${item.aug.name}${C.reset} from ${C.cyan}${item.faction}${C.reset} - ${affordStr}`
      );
    }
    ns.tprint(`${C.dim}These augs increase rep requirements after each purchase.${C.reset}`);
  }

  ns.tprint("");

  // Execute purchases if confirmed
  if (!config.confirm) {
    ns.tprint(`${C.yellow}DRY RUN - No purchases made.${C.reset}`);
    ns.tprint(`${C.dim}Run with --confirm to actually purchase these augmentations.${C.reset}`);
    return;
  }

  ns.tprint(`${C.cyan}Purchasing augmentations...${C.reset}`);
  ns.tprint("");

  const result = await executePurchases(ns, affordable);

  ns.tprint("");
  ns.tprint(`${C.cyan}${"═".repeat(70)}${C.reset}`);
  ns.tprint(
    `${C.white}Purchased ${C.green}${result.purchased}${C.reset}/${result.attempted} augmentations for ~$${ns.formatNumber(result.spent)}${C.reset}`
  );

  if (result.purchased > 0) {
    ns.tprint("");
    ns.tprint(`${C.yellow}Remember to install augmentations when ready:${C.reset}`);
    ns.tprint(
      `${C.dim}ns.singularity.installAugmentations() or use the Augmentations menu${C.reset}`
    );
  }
}
