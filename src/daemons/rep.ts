/**
 * Reputation Daemon
 *
 * Long-running daemon that automatically grinds faction reputation,
 * tracks progress toward augmentation unlocks, computes purchase plans,
 * and publishes RepStatus + BitnodeStatus to ports for the dashboard.
 *
 * Wraps the logic from auto/auto-rep.ts with port-based status publishing.
 *
 * Usage:
 *   run daemons/rep.js
 *   run daemons/rep.js --one-shot
 *   run daemons/rep.js --faction CyberSec
 *   run daemons/rep.js --no-work
 */
import { NS } from "@ns";
import { COLORS, makeBar, formatTime } from "/lib/utils";
import {
  analyzeFactions,
  findNextAugmentation,
  findNextWorkableAugmentation,
  calculatePurchasePriority,
  selectBestWorkType,
  getOwnedAugs,
  getInstalledAugs,
  getPendingAugs,
  getNeuroFluxInfo,
  calculateNeuroFluxPurchasePlan,
  getNonWorkableFactionProgress,
  getFactionWorkStatus,
  getSequentialPurchaseAugs,
  canDonateToFaction,
  calculateNFGDonatePurchasePlan,
} from "/controllers/factions";
import { publishStatus, peekStatus } from "/lib/ports";
import { STATUS_PORTS, RepStatus, BitnodeStatus } from "/types/ports";

// === BITNODE REQUIREMENTS (fl1ght.exe) ===

const BITNODE_REQUIREMENTS = {
  augmentations: 30,
  money: 100_000_000_000,
  hacking: 2500,
};

// === FACTION BACKDOOR SERVERS ===

const FACTION_BACKDOOR_SERVERS: Record<string, string> = {
  CyberSec: "CSEC",
  NiteSec: "avmnite-02h",
  "The Black Hand": "I.I.I.I",
  BitRunners: "run4theh111z",
};

/**
 * Get list of faction servers that need backdoors installed
 */
function getPendingBackdoors(ns: NS): string[] {
  const pending: string[] = [];
  for (const [faction, server] of Object.entries(FACTION_BACKDOOR_SERVERS)) {
    try {
      const serverObj = ns.getServer(server);
      if (serverObj.hasAdminRights && !serverObj.backdoorInstalled) {
        pending.push(faction);
      }
    } catch {
      // Server might not exist or not be accessible
    }
  }
  return pending;
}

/**
 * Compute BitnodeStatus for fl1ght.exe completion tracking
 */
function computeBitnodeStatus(ns: NS): BitnodeStatus {
  const player = ns.getPlayer();
  const installedAugs = ns.singularity.getOwnedAugmentations(false).length;

  const augsComplete = installedAugs >= BITNODE_REQUIREMENTS.augmentations;
  const moneyComplete = player.money >= BITNODE_REQUIREMENTS.money;
  const hackingComplete = player.skills.hacking >= BITNODE_REQUIREMENTS.hacking;

  return {
    augmentations: installedAugs,
    augmentationsRequired: BITNODE_REQUIREMENTS.augmentations,
    money: player.money,
    moneyRequired: BITNODE_REQUIREMENTS.money,
    moneyFormatted: ns.formatNumber(player.money),
    moneyRequiredFormatted: ns.formatNumber(BITNODE_REQUIREMENTS.money),
    hacking: player.skills.hacking,
    hackingRequired: BITNODE_REQUIREMENTS.hacking,
    augsComplete,
    moneyComplete,
    hackingComplete,
    allComplete: augsComplete && moneyComplete && hackingComplete,
  };
}

/**
 * Compute the full RepStatus for dashboard consumption
 */
function computeRepStatus(
  ns: NS,
  repGainRate: number,
): RepStatus {
  const player = ns.getPlayer();
  const ownedAugs = getOwnedAugs(ns);
  const installedAugs = getInstalledAugs(ns);
  const pendingAugs = getPendingAugs(ns);

  const factionData = analyzeFactions(ns, player, ownedAugs);
  const purchasePlan = calculatePurchasePriority(ns, factionData);

  // Use workable faction target (excludes infiltration-only factions)
  const target = findNextWorkableAugmentation(factionData);

  // Get non-workable faction progress
  const nonWorkableProgress = getNonWorkableFactionProgress(factionData);

  // Get NeuroFlux info
  const nfInfo = getNeuroFluxInfo(ns);

  // Determine target faction: regular aug or NFG fallback
  let targetFaction: string;
  let targetFactionRep = 0;
  let targetFactionFavor = 0;

  if (target) {
    targetFaction = target.faction.name;
    targetFactionRep = target.faction.currentRep;
    targetFactionFavor = target.faction.favor;
  } else if (nfInfo.bestFaction) {
    targetFaction = nfInfo.bestFaction;
    const fd = factionData.find(f => f.name === nfInfo.bestFaction);
    targetFactionRep = fd?.currentRep ?? 0;
    targetFactionFavor = fd?.favor ?? 0;
  } else {
    targetFaction = "None";
  }

  const repRequired = target?.aug?.repReq ?? 0;
  const currentRep = target?.faction?.currentRep ?? targetFactionRep;
  const repGap = Math.max(0, repRequired - currentRep);
  const repProgress = repRequired > 0 ? Math.min(1, currentRep / repRequired) : 0;

  const favorToUnlock = ns.getFavorToDonate();
  const playerMoney = player.money;

  // Calculate ETA
  let eta = "???";
  if (repGap > 0 && repGainRate > 0) {
    eta = formatTime(repGap / repGainRate);
  } else if (repGap <= 0) {
    eta = "Ready";
  }

  const nextAugCost = target?.aug?.basePrice ?? 0;

  // Pending backdoors
  const pendingBackdoors = getPendingBackdoors(ns);

  // Unlocked augs available to buy
  const hasUnlockedAugs = purchasePlan.length > 0;

  // Work status for target faction
  const workStatus = targetFaction !== "None"
    ? getFactionWorkStatus(ns, player, targetFaction)
    : {
        isWorkingForFaction: false,
        isOptimalWork: false,
        bestWorkType: "hacking" as const,
        currentWorkType: null,
        isWorkable: false,
      };

  // Sequential purchase augs (Shadows of Anarchy, etc.)
  const sequentialAugs = getSequentialPurchaseAugs(ns, factionData, playerMoney);

  // NeuroFlux Governor info
  const nfPlan = calculateNeuroFluxPurchasePlan(ns, playerMoney);
  const nfRepProgress = nfInfo.repRequired > 0
    ? Math.min(1, nfInfo.bestFactionRep / nfInfo.repRequired)
    : 0;
  const nfRepGap = Math.max(0, nfInfo.repRequired - nfInfo.bestFactionRep);
  const canDonate = nfInfo.bestFaction ? canDonateToFaction(ns, nfInfo.bestFaction) : false;
  const donatePlan = canDonate ? calculateNFGDonatePurchasePlan(ns, playerMoney) : null;

  return {
    targetFaction,
    nextAugName: target?.aug?.name ?? null,
    repRequired,
    repRequiredFormatted: ns.formatNumber(repRequired),
    currentRep,
    currentRepFormatted: ns.formatNumber(currentRep),
    repGap,
    repGapFormatted: ns.formatNumber(repGap),
    repGapPositive: repGap > 0,
    repProgress,
    pendingAugs: pendingAugs.length,
    installedAugs: installedAugs.length,
    purchasePlan: purchasePlan.map(item => ({
      name: item.name,
      faction: item.faction,
      baseCost: item.basePrice,
      adjustedCost: item.adjustedCost,
      costFormatted: ns.formatNumber(item.basePrice),
      adjustedCostFormatted: ns.formatNumber(item.adjustedCost),
    })),
    repGainRate,
    eta,
    nextAugCost,
    nextAugCostFormatted: ns.formatNumber(nextAugCost),
    canAffordNextAug: playerMoney >= nextAugCost,
    favor: targetFactionFavor,
    favorToUnlock,
    pendingBackdoors,
    hasUnlockedAugs,
    nonWorkableFactions: nonWorkableProgress.map(item => ({
      factionName: item.faction.name,
      nextAugName: item.nextAug.name,
      progress: item.progress,
      currentRep: ns.formatNumber(item.faction.currentRep),
      requiredRep: ns.formatNumber(item.nextAug.repReq),
    })),
    sequentialAugs: sequentialAugs.map(item => ({
      faction: item.faction,
      augName: item.aug.name,
      cost: item.aug.basePrice,
      costFormatted: ns.formatNumber(item.aug.basePrice),
      canAfford: item.canAfford,
    })),
    isWorkingForFaction: workStatus.isWorkingForFaction,
    isOptimalWork: workStatus.isOptimalWork,
    bestWorkType: workStatus.bestWorkType,
    currentWorkType: workStatus.currentWorkType,
    isWorkable: workStatus.isWorkable,
    neuroFlux: nfInfo.bestFaction ? {
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
      purchasePlan: nfPlan.purchases > 0 ? {
        startLevel: nfPlan.startLevel,
        endLevel: nfPlan.endLevel,
        purchases: nfPlan.purchases,
        totalCost: nfPlan.totalCost,
        totalCostFormatted: ns.formatNumber(nfPlan.totalCost),
      } : null,
      canDonate,
      donationPlan: donatePlan && donatePlan.canExecute ? {
        purchases: donatePlan.purchases,
        totalDonationCost: donatePlan.totalDonationCost,
        totalDonationCostFormatted: ns.formatNumber(donatePlan.totalDonationCost),
        totalPurchaseCost: donatePlan.totalPurchaseCost,
        totalPurchaseCostFormatted: ns.formatNumber(donatePlan.totalPurchaseCost),
        totalCost: donatePlan.totalCost,
        totalCostFormatted: ns.formatNumber(donatePlan.totalCost),
      } : null,
    } : null,
  };
}

/**
 * Print formatted rep status to the script log
 */
function printStatus(ns: NS, repStatus: RepStatus, bitnodeStatus: BitnodeStatus): void {
  const C = COLORS;

  ns.print(`${C.cyan}=== Rep Daemon ===${C.reset}`);
  ns.print(
    `${C.dim}Target: ${C.reset}${C.white}${repStatus.targetFaction}${C.reset}` +
    `  ${C.dim}|${C.reset}  ${C.yellow}${repStatus.pendingAugs}${C.reset} ${C.dim}pending${C.reset}` +
    `  ${C.dim}|${C.reset}  ${C.green}${repStatus.purchasePlan.length}${C.reset} ${C.dim}unlocked${C.reset}`
  );

  // Next aug progress
  if (repStatus.nextAugName) {
    const progress = repStatus.repProgress;
    const bar = makeBar(progress, 30, progress >= 1 ? C.green : C.cyan);
    ns.print("");
    ns.print(`${C.cyan}NEXT UNLOCK${C.reset}: ${C.yellow}${repStatus.nextAugName}${C.reset}`);
    ns.print(`${bar} ${C.white}${(progress * 100).toFixed(1)}%${C.reset}`);
    ns.print(
      `${C.dim}${repStatus.currentRepFormatted} / ${repStatus.repRequiredFormatted} rep${C.reset}` +
      (repStatus.repGapPositive ? `  ${C.dim}(need ${repStatus.repGapFormatted} more)${C.reset}` : "")
    );
    ns.print(
      `${C.white}ETA:${C.reset} ${C.cyan}${repStatus.eta}${C.reset}` +
      (repStatus.repGainRate > 0 ? ` ${C.dim}@ ${ns.formatNumber(repStatus.repGainRate)}/s${C.reset}` : "") +
      `  ${C.dim}|${C.reset}  ` +
      (repStatus.canAffordNextAug
        ? `${C.green}$${repStatus.nextAugCostFormatted}${C.reset}`
        : `${C.red}$${repStatus.nextAugCostFormatted}${C.reset}`)
    );
  } else if (repStatus.neuroFlux?.bestFaction) {
    ns.print("");
    ns.print(`${C.cyan}NEUROFLUX GRINDING MODE${C.reset}`);
    ns.print(`${C.dim}Faction: ${C.reset}${C.white}${repStatus.neuroFlux.bestFaction}${C.reset}`);
    if (!repStatus.neuroFlux.hasEnoughRep) {
      ns.print(`${C.dim}NFG rep: ${repStatus.neuroFlux.currentRepFormatted} / ${repStatus.neuroFlux.repRequiredFormatted}${C.reset}`);
    } else {
      ns.print(`${C.green}Can purchase NFG${C.reset} ${C.dim}($${repStatus.neuroFlux.currentPriceFormatted})${C.reset}`);
    }
  } else {
    ns.print("");
    ns.print(`${C.yellow}No faction with available augmentations found.${C.reset}`);
  }

  // Work status
  if (repStatus.isWorkable) {
    const workColor = repStatus.isOptimalWork ? C.green : repStatus.isWorkingForFaction ? C.yellow : C.red;
    const workLabel = repStatus.isOptimalWork
      ? `${repStatus.currentWorkType} (optimal)`
      : repStatus.isWorkingForFaction
        ? `${repStatus.currentWorkType} (not optimal, best: ${repStatus.bestWorkType})`
        : `not working (best: ${repStatus.bestWorkType})`;
    ns.print(`${C.dim}Work:${C.reset} ${workColor}${workLabel}${C.reset}`);
  }

  // Purchase plan summary
  if (repStatus.purchasePlan.length > 0) {
    const totalCost = repStatus.purchasePlan.reduce((sum, a) => sum + a.adjustedCost, 0);
    ns.print("");
    ns.print(`${C.cyan}PURCHASE ORDER${C.reset} ${C.dim}(${repStatus.purchasePlan.length} augs, $${ns.formatNumber(totalCost)} total)${C.reset}`);
    for (let i = 0; i < Math.min(repStatus.purchasePlan.length, 8); i++) {
      const item = repStatus.purchasePlan[i];
      ns.print(`  ${C.dim}${(i + 1).toString().padStart(2)}.${C.reset} ${C.white}${item.name.substring(0, 30).padEnd(30)}${C.reset} ${C.dim}$${item.adjustedCostFormatted}${C.reset}`);
    }
    if (repStatus.purchasePlan.length > 8) {
      ns.print(`  ${C.dim}... +${repStatus.purchasePlan.length - 8} more${C.reset}`);
    }
  }

  // Bitnode status
  ns.print("");
  ns.print(`${C.cyan}BITNODE${C.reset}  ` +
    `${bitnodeStatus.augsComplete ? C.green : C.dim}Augs:${bitnodeStatus.augmentations}/${bitnodeStatus.augmentationsRequired}${C.reset}  ` +
    `${bitnodeStatus.moneyComplete ? C.green : C.dim}$:${bitnodeStatus.moneyFormatted}/${bitnodeStatus.moneyRequiredFormatted}${C.reset}  ` +
    `${bitnodeStatus.hackingComplete ? C.green : C.dim}Hack:${bitnodeStatus.hacking}/${bitnodeStatus.hackingRequired}${C.reset}` +
    (bitnodeStatus.allComplete ? `  ${C.green}READY${C.reset}` : "")
  );
}

/**
 * Full mode: all Singularity functions available (SF4).
 * This is the original daemon loop, extracted verbatim.
 */
async function runFullMode(
  ns: NS,
  targetFactionOverride: string,
  noWork: boolean,
  interval: number,
  oneShot: boolean,
): Promise<void> {
  // Track rep gain rate with exponential smoothing
  let lastRep = 0;
  let lastRepTime = Date.now();
  let repGainRate = 0;
  let lastTargetFaction = "";
  let lastNotifiedFaction = "";

  do {
    ns.clearLog();

    const player = ns.getPlayer();
    const ownedAugs = getOwnedAugs(ns);
    const factionData = analyzeFactions(ns, player, ownedAugs);

    // Find next workable augmentation target
    let workTarget = findNextWorkableAugmentation(factionData);

    // Override with specific faction if requested
    if (targetFactionOverride) {
      const forcedFaction = factionData.find(f => f.name === targetFactionOverride);
      if (forcedFaction && forcedFaction.availableAugs.length > 0) {
        workTarget = {
          aug: forcedFaction.availableAugs[0],
          faction: forcedFaction,
          repGap: forcedFaction.availableAugs[0].repReq - forcedFaction.currentRep,
        };
      }
    }

    // Determine work target: regular aug or NFG fallback
    let workTargetFaction: string | null = null;
    let workTargetRep = 0;

    if (workTarget) {
      workTargetFaction = workTarget.faction.name;
      workTargetRep = workTarget.faction.currentRep;
    } else {
      // No regular augs to unlock - fall back to best NFG faction
      const nfInfo = getNeuroFluxInfo(ns);
      if (nfInfo.bestFaction) {
        workTargetFaction = nfInfo.bestFaction;
        const fd = factionData.find(f => f.name === nfInfo.bestFaction);
        workTargetRep = fd?.currentRep ?? 0;
      }
    }

    // Track rep gain rate with exponential smoothing
    if (workTargetFaction) {
      const now = Date.now();

      if (lastRep > 0 && lastTargetFaction === workTargetFaction) {
        const timeDelta = (now - lastRepTime) / 1000;
        if (timeDelta > 0) {
          const repDelta = workTargetRep - lastRep;
          const newRate = repDelta / timeDelta;
          repGainRate = repGainRate * 0.7 + newRate * 0.3;
        }
      }

      lastRep = workTargetRep;
      lastRepTime = now;
      lastTargetFaction = workTargetFaction;

      // Terminal notification when target faction changes
      if (workTargetFaction !== lastNotifiedFaction) {
        const bestWork = selectBestWorkType(ns, player);
        ns.tprint(`INFO: >>> Work for ${workTargetFaction} (${bestWork}) <<<`);
        lastNotifiedFaction = workTargetFaction;
      }

      // Auto-work for target faction unless --no-work
      if (!noWork) {
        const nextAug = workTarget?.aug;
        const needsWork = !nextAug || nextAug.repReq > workTargetRep || !workTarget;

        if (needsWork) {
          const bestWork = selectBestWorkType(ns, player);
          const currentWork = ns.singularity.getCurrentWork();
          const currentlyWorking =
            currentWork?.type === "FACTION" &&
            currentWork?.factionName === workTargetFaction;

          if (!currentlyWorking ||
              (currentWork as { factionWorkType?: string }).factionWorkType !== bestWork) {
            ns.singularity.workForFaction(workTargetFaction, bestWork, ns.singularity.isFocused());
          }
        }
      }
    }

    // Compute and publish RepStatus
    const repStatus = computeRepStatus(ns, repGainRate);
    publishStatus(ns, STATUS_PORTS.rep, repStatus);

    // Compute and publish BitnodeStatus
    const bitnodeStatus = computeBitnodeStatus(ns);
    publishStatus(ns, STATUS_PORTS.bitnode, bitnodeStatus);

    // Print terminal display
    printStatus(ns, repStatus, bitnodeStatus);

    if (!oneShot) {
      ns.print(`\n${COLORS.dim}Next check in ${interval / 1000}s...${COLORS.reset}`);
      await ns.sleep(interval);
    }
  } while (!oneShot);
}

/**
 * Lite mode: Singularity API not available (no SF4).
 * Displays cached port data and prints terminal instructions.
 */
async function runLiteMode(ns: NS, oneShot: boolean, interval: number): Promise<void> {
  const C = COLORS;
  let firstRun = true;

  do {
    ns.clearLog();
    ns.print(`${C.yellow}=== Rep Daemon (Lite Mode) ===${C.reset}`);
    ns.print(`${C.dim}Singularity API not available (need SF4)${C.reset}`);

    // Read cached status from port (may exist from a previous full run)
    const cached = peekStatus<RepStatus>(ns, STATUS_PORTS.rep);
    if (cached) {
      ns.print("");
      ns.print(`${C.dim}Showing cached data:${C.reset}`);
      ns.print(`  ${C.dim}Target:${C.reset} ${C.white}${cached.targetFaction}${C.reset}`);
      ns.print(`  ${C.dim}Rep:${C.reset} ${C.white}${cached.currentRepFormatted} / ${cached.repRequiredFormatted}${C.reset}`);
      ns.print(`  ${C.dim}Pending:${C.reset} ${C.yellow}${cached.pendingAugs}${C.reset} ${C.dim}augs${C.reset}`);
      if (cached.nextAugName) {
        ns.print(`  ${C.dim}Next:${C.reset} ${C.white}${cached.nextAugName}${C.reset}`);
      }
      if (cached.purchasePlan.length > 0) {
        ns.print(`  ${C.dim}Unlocked:${C.reset} ${C.green}${cached.purchasePlan.length}${C.reset} ${C.dim}augs${C.reset}`);
      }
    } else {
      ns.print("");
      ns.print(`${C.dim}No cached data available.${C.reset}`);
    }

    if (firstRun) {
      ns.tprint(`INFO: Rep daemon running in lite mode (no Singularity). ` +
                `Use terminal: singularity.workForFaction("FactionName", "hacking", true)`);
      firstRun = false;
    }

    if (!oneShot) await ns.sleep(interval);
  } while (!oneShot);
}

/** Singularity functions used by full mode (controllers/factions + this daemon) */
const SINGULARITY_FUNCTIONS = [
  "singularity.getOwnedAugmentations",
  "singularity.getAugmentationsFromFaction",
  "singularity.getFactionRep",
  "singularity.getFactionFavor",
  "singularity.getAugmentationRepReq",
  "singularity.getAugmentationPrice",
  "singularity.getAugmentationPrereq",
  "singularity.getCurrentWork",
  "singularity.workForFaction",
  "singularity.isFocused",
];

/**
 * Calculate the RAM needed for full mode (singularity + base NS functions).
 * Uses getFunctionRamCost (0 GB) to probe actual costs at the current SF4 level.
 */
function calcFullModeRam(ns: NS): number {
  let ram = 0;
  for (const fn of SINGULARITY_FUNCTIONS) {
    ram += ns.getFunctionRamCost(fn);
  }
  // Base NS functions used: getPlayer, getServer, getFavorToDonate, etc.
  ram += ns.getFunctionRamCost("getPlayer");
  ram += ns.getFunctionRamCost("getServer");
  ram += ns.getFunctionRamCost("getFavorToDonate");
  ram += ns.getFunctionRamCost("getPortHandle");
  ram += ns.getFunctionRamCost("fileExists");
  // Base script cost
  ram += 1.6;
  return Math.ceil(ram * 100) / 100; // round to Bitburner's precision
}

export async function main(ns: NS): Promise<void> {
  ns.ramOverride(5); // Start cheap so we can always launch
  ns.disableLog("ALL");

  const flags = ns.flags([
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

  const targetFactionOverride = String(flags.faction);
  const noWork = flags["no-work"];
  const interval = flags.interval;
  const oneShot = flags["one-shot"];

  // Check 1: Does the player own SF4 (Singularity)?
  const sf4Level = ns.getResetInfo().ownedSF.get(4) ?? 0;

  // Check 2: Can we afford the RAM for singularity calls?
  let hasSingularity = false;
  if (sf4Level > 0) {
    const needed = calcFullModeRam(ns);
    const available = ns.getServerMaxRam("home") - ns.getServerUsedRam("home")
      + 5; // reclaim the 5 GB this script is currently using
    if (available >= needed) {
      const actual = ns.ramOverride(needed);
      hasSingularity = actual >= needed;
      if (hasSingularity) {
        ns.tprint(`INFO: Rep daemon: full mode (SF4.${sf4Level}, ${ns.formatRam(actual)} RAM)`);
      }
    }
    if (!hasSingularity) {
      ns.tprint(`WARN: Rep daemon: have SF4 but not enough RAM for singularity ` +
        `(need ${ns.formatRam(calcFullModeRam(ns))}, ` +
        `server has ${ns.formatRam(ns.getServerMaxRam("home") - ns.getServerUsedRam("home") + 5)} available)`);
    }
  }

  if (hasSingularity) {
    await runFullMode(ns, targetFactionOverride, noWork, interval, oneShot);
  } else {
    await runLiteMode(ns, oneShot, interval);
  }
}
