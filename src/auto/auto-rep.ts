import { NS, Player } from "@ns";
import { COLORS, makeBar, formatTime } from "/lib/utils";
import {
  AugmentationInfo,
  FactionData,
  PurchasePlanItem,
  NextTarget,
  analyzeFactions,
  findNextAugmentation,
  calculatePurchasePriority,
  selectBestWorkType,
  getOwnedAugs,
  getInstalledAugs,
  getPendingAugs,
  getNeuroFluxInfo,
} from "/lib/factions";

/**
 * Auto Reputation Manager
 *
 * Automatically manages faction reputation grinding:
 * - Finds the faction with the next available augmentation
 * - Switches to optimal method of gaining rep
 * - Displays progress dashboard with ETA
 * - Shows recommended augmentation purchase priority
 *
 * Requires Singularity API (SF4)
 *
 * Run: run auto/auto-rep.js
 *      run auto/auto-rep.js --one-shot
 *      run auto/auto-rep.js --faction CyberSec   (target specific faction)
 *      run auto/auto-rep.js --no-work            (dashboard only, don't auto-work)
 */

// === TYPES ===

export interface RepConfig {
  faction: string;
  noWork: boolean;
  interval: number;
  reserve: number;
  oneShot: boolean;
}

export interface RepStatus {
  factionData: FactionData[];
  nextTarget: NextTarget | null;
  purchasePlan: PurchasePlanItem[];
  pendingAugs: string[];
  installedAugs: string[];
}

// Re-export types from factions library for convenience
export type { AugmentationInfo, FactionData, PurchasePlanItem, NextTarget };

// === CORE LOGIC ===

/**
 * Get full reputation status
 */
export function getRepStatus(ns: NS, player: Player): RepStatus {
  const ownedAugs = getOwnedAugs(ns);
  const installedAugs = getInstalledAugs(ns);
  const pendingAugs = getPendingAugs(ns);

  const factionData = analyzeFactions(ns, player, ownedAugs);
  const nextTarget = findNextAugmentation(factionData);
  const purchasePlan = calculatePurchasePriority(ns, factionData);

  return {
    factionData,
    nextTarget,
    purchasePlan,
    pendingAugs,
    installedAugs,
  };
}

// === DISPLAY ===

/**
 * Format reputation status for display
 */
export function formatRepStatus(
  ns: NS,
  status: RepStatus,
  config: RepConfig,
  repGainRate: number
): string[] {
  const C = COLORS;
  const lines: string[] = [];
  const player = ns.getPlayer();
  const currentWork = ns.singularity.getCurrentWork();

  // === HEADER ===
  lines.push(
    `${C.white}AUTO REPUTATION MANAGER${C.reset}  ${C.dim}|${C.reset}  ${C.green}$${ns.formatNumber(player.money)}${C.reset}  ${C.dim}|${C.reset}  ${C.yellow}${status.pendingAugs.length}${C.reset} ${C.dim}pending augs${C.reset}`
  );

  // Check for NFG fallback when no regular augs
  const nfInfo = getNeuroFluxInfo(ns);

  if (!status.nextTarget) {
    // No regular augs to unlock - show NFG grinding mode
    if (nfInfo.bestFaction) {
      const nfFaction = status.factionData.find(f => f.name === nfInfo.bestFaction);
      lines.push("");
      lines.push(`${C.cyan}NEUROFLUX GRINDING MODE${C.reset}`);
      lines.push(`${C.cyan}  TARGET${C.reset}: ${C.white}${nfInfo.bestFaction}${C.reset}  ${C.dim}(favor: ${nfFaction?.favor.toFixed(0) ?? 0}/${ns.getFavorToDonate().toFixed(0)})${C.reset}`);
      lines.push("");
      lines.push(`${C.dim}Rep Required: ${ns.formatNumber(nfInfo.repRequired)}  |  Have: ${ns.formatNumber(nfInfo.bestFactionRep)}${C.reset}`);
      if (nfInfo.hasEnoughRep) {
        lines.push(`${C.green}✓ Can purchase NeuroFlux Governor${C.reset} ${C.dim}($${ns.formatNumber(nfInfo.currentPrice)})${C.reset}`);
      } else {
        const repNeeded = nfInfo.repRequired - nfInfo.bestFactionRep;
        lines.push(`${C.yellow}Need ${ns.formatNumber(repNeeded)} more rep for NFG${C.reset}`);
        if (repGainRate > 0) {
          lines.push(`${C.dim}ETA: ${formatTime(repNeeded / repGainRate)} @ ${ns.formatNumber(repGainRate)}/s${C.reset}`);
        }
      }
      return lines;
    }

    lines.push("");
    lines.push(`${C.yellow}No faction with available augmentations found.${C.reset}`);
    lines.push(`${C.dim}Join a faction or complete more requirements.${C.reset}`);
    return lines;
  }

  const target = status.nextTarget.faction;
  const nextAug = status.nextTarget.aug;
  const currentRep = target.currentRep;

  // === CURRENT FOCUS ===
  lines.push("");

  // Faction + work status on one line
  let workStatus = `${C.dim}not working${C.reset}`;
  if (currentWork?.type === "FACTION" && currentWork?.factionName === target.name) {
    workStatus = `${C.green}${currentWork.factionWorkType}${C.reset}`;
  } else if (currentWork?.type === "FACTION") {
    workStatus = `${C.yellow}working for ${currentWork.factionName}${C.reset}`;
  } else if (currentWork) {
    workStatus = `${C.yellow}${currentWork.type.toLowerCase()}${C.reset}`;
  }
  lines.push(
    `${C.cyan}CURRENT FOCUS${C.reset}: ${C.white}${target.name}${C.reset}  ${C.dim}→${C.reset}  ${workStatus}  ${C.dim}(favor: ${target.favor.toFixed(0)}/${ns.getFavorToDonate().toFixed(0)})${C.reset}`
  );

  // === NEXT UNLOCK ===
  if (nextAug) {
    const repProgress = Math.min(1, currentRep / nextAug.repReq);
    const repBar = makeBar(repProgress, 40, repProgress >= 1 ? C.green : C.cyan);
    const repNeeded = Math.max(0, nextAug.repReq - currentRep);
    const canAfford = player.money - config.reserve >= nextAug.basePrice;

    lines.push("");
    lines.push(`${C.cyan}  NEXT UNLOCK${C.reset}:  ${C.yellow}${nextAug.name}${C.reset}`);
    lines.push(`${repBar} ${C.white}${(repProgress * 100).toFixed(1)}%${C.reset}`);

    // Rep progress line
    let repLine = `${C.dim}${ns.formatNumber(currentRep)} / ${ns.formatNumber(nextAug.repReq)} rep${C.reset}`;
    if (repNeeded > 0) {
      repLine += `  ${C.dim}(need ${ns.formatNumber(repNeeded)} more)${C.reset}`;
    }
    lines.push(repLine);

    // ETA and cost on one line
    let etaStr: string;
    if (repNeeded > 0 && repGainRate > 0) {
      etaStr = `${C.white}ETA:${C.reset} ${C.cyan}${formatTime(repNeeded / repGainRate)}${C.reset} ${C.dim}@ ${ns.formatNumber(repGainRate)}/s${C.reset}`;
    } else if (repNeeded <= 0) {
      etaStr = `${C.green}✓ rep unlocked${C.reset}`;
    } else {
      etaStr = `${C.dim}ETA: calculating...${C.reset}`;
    }
    const costStr = canAfford
      ? `${C.green}✓ $${ns.formatNumber(nextAug.basePrice)}${C.reset}`
      : `${C.red}✗ $${ns.formatNumber(nextAug.basePrice)}${C.reset} ${C.dim}(need $${ns.formatNumber(nextAug.basePrice - player.money + config.reserve)} more)${C.reset}`;
    lines.push(`${etaStr}  ${C.dim}|${C.reset}  ${costStr}`);

    // Ready to purchase banner
    if (repNeeded <= 0 && canAfford) {
      lines.push("");
      lines.push(
        `${C.green}▶ READY TO PURCHASE${C.reset}  ${C.dim}run${C.reset} ${C.white}factions/rep-purchase.js --confirm${C.reset}`
      );
    }
  } else {
    lines.push("");
    lines.push(`${C.green}✓ All augmentations from ${target.name} unlocked!${C.reset}`);
  }

  // === PURCHASE ORDER ===
  const purchasePlan = status.purchasePlan;

  lines.push("");
  lines.push(`${C.cyan}${"═".repeat(65)}${C.reset}`);

  if (purchasePlan.length === 0) {
    lines.push(`${C.cyan}PURCHASE ORDER${C.reset}  ${C.dim}no augmentations unlocked yet${C.reset}`);
  } else {
    const totalCost = purchasePlan.reduce((sum, a) => sum + a.adjustedCost, 0);
    const availableMoney = player.money - config.reserve;
    let runningTotal = 0;
    const affordableCount = purchasePlan.filter((a) => {
      runningTotal += a.adjustedCost;
      return runningTotal <= availableMoney;
    }).length;

    lines.push(
      `${C.cyan}PURCHASE ORDER${C.reset}  ${C.dim}${purchasePlan.length} unlocked, ${C.green}${affordableCount} affordable${C.reset}${C.dim}, $${ns.formatNumber(totalCost)} total${C.reset}`
    );
    lines.push("");

    lines.push(
      `${C.dim}${"#".padStart(2)}  ${"Augmentation".padEnd(34)} ${"Cost".padStart(11)}  ${"Adjusted".padStart(11)}    ${"Total".padStart(11)}${C.reset}`
    );

    runningTotal = 0;
    const maxShow = 12;

    for (let i = 0; i < Math.min(purchasePlan.length, maxShow); i++) {
      const item = purchasePlan[i];
      runningTotal += item.adjustedCost;
      const canAffordThis = availableMoney >= runningTotal;
      const color = canAffordThis ? C.green : C.dim;
      const nameColor = canAffordThis ? C.white : C.dim;

      lines.push(
        `${color}${(i + 1).toString().padStart(2)}${C.reset}  ` +
          `${nameColor}${item.name.substring(0, 34).padEnd(34)}${C.reset} ` +
          `${C.dim}$${ns.formatNumber(item.basePrice).padStart(10)}${C.reset} → ` +
          `${color}${ns.formatNumber(item.adjustedCost).padStart(10)}${C.reset}    ` +
          `${color}$${ns.formatNumber(runningTotal).padStart(10)}${C.reset}`
      );
    }

    if (purchasePlan.length > maxShow) {
      lines.push(`${C.dim}    ... +${purchasePlan.length - maxShow} more${C.reset}`);
    }

    if (totalCost > availableMoney) {
      lines.push("");
      lines.push(
        `${C.yellow}Need $${ns.formatNumber(totalCost - availableMoney)} more to buy all${C.reset}`
      );
    }
  }

  // === SWITCH TO ===
  const otherFactions = status.factionData.filter(
    (f) => f.name !== target.name && f.availableAugs.length > 0
  );
  const hints = otherFactions
    .map((f) => {
      const nextUnlock = f.availableAugs.find((aug) => aug.repReq > f.currentRep);
      if (!nextUnlock) return null;
      return {
        faction: f.name,
        aug: nextUnlock.name,
        repNeeded: nextUnlock.repReq - f.currentRep,
      };
    })
    .filter((h): h is NonNullable<typeof h> => h !== null)
    .sort((a, b) => a.repNeeded - b.repNeeded);

  if (hints.length > 0) {
    lines.push("");
    lines.push(`${C.cyan}SWITCH TO${C.reset}`);
    for (const hint of hints.slice(0, 4)) {
      lines.push(
        `  ${C.white}${hint.faction.padEnd(18)}${C.reset} ${C.dim}→${C.reset} ${C.yellow}${hint.aug.substring(0, 26).padEnd(26)}${C.reset} ${C.dim}(${ns.formatNumber(hint.repNeeded)} rep)${C.reset}`
      );
    }
    if (hints.length > 4) {
      lines.push(`  ${C.dim}+${hints.length - 4} more factions${C.reset}`);
    }
  }

  return lines;
}

// === RUNNER ===

export async function main(ns: NS): Promise<void> {
  const FLAGS = ns.flags([
    ["faction", ""],
    ["no-work", false],
    ["interval", 2000],
    ["reserve", 0],
    ["one-shot", false],
  ]) as {
    faction: string;
    "no-work": boolean;
    interval: number;
    reserve: number;
    "one-shot": boolean;
    _: string[];
  };

  const config: RepConfig = {
    faction: String(FLAGS.faction),
    noWork: FLAGS["no-work"],
    interval: Number(FLAGS.interval),
    reserve: Number(FLAGS.reserve),
    oneShot: FLAGS["one-shot"],
  };

  ns.disableLog("ALL");

  if (!config.oneShot) {
    ns.ui.openTail();
    ns.ui.resizeTail(900, 700);
  }

  // Track rep gain rate
  let lastRep = 0;
  let lastRepTime = Date.now();
  let repGainRate = 0;
  let lastTargetFaction = "";

  do {
    ns.clearLog();

    const player = ns.getPlayer();
    const status = getRepStatus(ns, player);

    // Override with specific faction if requested
    if (config.faction && status.nextTarget) {
      const forcedFaction = status.factionData.find(
        (f) => f.name === config.faction
      );
      if (forcedFaction && forcedFaction.availableAugs.length > 0) {
        status.nextTarget = {
          aug: forcedFaction.availableAugs[0],
          faction: forcedFaction,
          repGap: forcedFaction.availableAugs[0].repReq - forcedFaction.currentRep,
        };
      }
    }

    // Determine work target: regular aug target or NFG faction fallback
    let workTargetFaction: string | null = null;
    let workTargetRep = 0;

    if (status.nextTarget) {
      workTargetFaction = status.nextTarget.faction.name;
      workTargetRep = status.nextTarget.faction.currentRep;
    } else {
      // No regular augs to unlock - fall back to best NFG faction for favor grinding
      const nfInfo = getNeuroFluxInfo(ns);
      if (nfInfo.bestFaction) {
        workTargetFaction = nfInfo.bestFaction;
        const factionData = status.factionData.find(f => f.name === nfInfo.bestFaction);
        workTargetRep = factionData?.currentRep ?? 0;
      }
    }

    // Calculate rep gain rate
    if (workTargetFaction) {
      const now = Date.now();

      if (lastRep > 0 && lastTargetFaction === workTargetFaction) {
        const timeDelta = (now - lastRepTime) / 1000;
        if (timeDelta > 0) {
          const repDelta = workTargetRep - lastRep;
          repGainRate = repGainRate * 0.7 + (repDelta / timeDelta) * 0.3;
        }
      }
      lastRep = workTargetRep;
      lastRepTime = now;
      lastTargetFaction = workTargetFaction;

      // Auto-work logic - work for target faction (regular aug or NFG fallback)
      if (!config.noWork) {
        const nextAug = status.nextTarget?.aug;
        const needsWork = !nextAug || nextAug.repReq > workTargetRep || !status.nextTarget;

        if (needsWork) {
          const bestWork = selectBestWorkType(ns, player);
          const currentWork = ns.singularity.getCurrentWork();
          const currentlyWorking =
            currentWork?.type === "FACTION" &&
            currentWork?.factionName === workTargetFaction;
          if (!currentlyWorking || currentWork.factionWorkType !== bestWork) {
            ns.singularity.workForFaction(workTargetFaction, bestWork, ns.singularity.isFocused());
          }
        }
      }
    }

    const lines = formatRepStatus(ns, status, config, repGainRate);
    for (const line of lines) {
      ns.print(line);
    }

    if (!config.oneShot) {
      await ns.sleep(config.interval);
    }
  } while (!config.oneShot);
}
