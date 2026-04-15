/**
 * Hacknet Server Daemon (Tiered)
 *
 * Manages Hacknet Servers (BN9 / SF9 unlocked) — purchases, upgrades, and hash spending.
 * All ns.hacknet.* functions cost 0 RAM, so tiers gate features, not RAM.
 *
 *   Tier 0 (monitor):      ~3 GB  - Reads stats, publishes status
 *   Tier 1 (auto-buy):     ~3 GB  - Purchases nodes & upgrades via budget
 *   Tier 2 (hash-spender): ~3 GB  - Auto-spends hashes for money
 *
 * Usage:
 *   run daemons/hacknet.js
 */
import { NS, NodeStats } from "@ns";
import { COLORS } from "/lib/utils";
import { publishStatus } from "/lib/ports";
import { writeDefaultConfig, getConfigNumber, getConfigBool } from "/lib/config";
import { STATUS_PORTS, HacknetStatus, HacknetServerInfo } from "/types/ports";
import { getBudgetBalance, notifyPurchase, reportCap } from "/lib/budget";

const C = COLORS;

// === TIER DEFINITIONS ===

const BASE_SCRIPT_COST = 1.6;
const RAM_BUFFER_PERCENT = 0.05;

interface HacknetTierConfig {
  tier: number;
  name: "monitor" | "auto-buy" | "hash-spender";
  functions: string[];
  features: string[];
}

const HACKNET_TIERS: HacknetTierConfig[] = [
  {
    tier: 0,
    name: "monitor",
    functions: [],
    features: ["server stats", "hash tracking", "upgrade costs"],
  },
  {
    tier: 1,
    name: "auto-buy",
    functions: [],
    features: ["auto-purchase nodes", "auto-upgrade nodes", "ROI optimization"],
  },
  {
    tier: 2,
    name: "hash-spender",
    functions: [],
    features: ["auto-spend hashes for money"],
  },
];

const BASE_FUNCTIONS = [
  "getServerMaxRam",
  "getServerUsedRam",
  "getPlayer",
  "getPortHandle",
  "fileExists",
];

// === TIER SELECTION ===

function calculateTierRam(ns: NS, tierIndex: number): number {
  let ram = BASE_SCRIPT_COST;
  for (const fn of BASE_FUNCTIONS) {
    ram += ns.getFunctionRamCost(fn);
  }
  for (let i = 0; i <= tierIndex; i++) {
    for (const fn of HACKNET_TIERS[i].functions) {
      ram += ns.getFunctionRamCost(fn);
    }
  }
  ram *= (1 + RAM_BUFFER_PERCENT);
  return Math.ceil(ram * 10) / 10;
}

function selectBestTier(potentialRam: number, tierRamCosts: number[]): { tier: HacknetTierConfig; ramCost: number } {
  let bestTierIndex = 0;
  for (let i = HACKNET_TIERS.length - 1; i >= 0; i--) {
    if (potentialRam >= tierRamCosts[i]) {
      bestTierIndex = i;
      break;
    }
  }
  return { tier: HACKNET_TIERS[bestTierIndex], ramCost: tierRamCosts[bestTierIndex] };
}

function getAvailableFeatures(tier: number): string[] {
  const features: string[] = [];
  for (let i = 0; i <= tier; i++) {
    features.push(...HACKNET_TIERS[i].features);
  }
  return features;
}

function getUnavailableFeatures(tier: number): string[] {
  const features: string[] = [];
  for (let i = tier + 1; i < HACKNET_TIERS.length; i++) {
    features.push(...HACKNET_TIERS[i].features);
  }
  return features;
}

// === UPGRADE CANDIDATE EVALUATION ===

interface UpgradeCandidate {
  type: "new" | "level" | "ram" | "cores" | "cache";
  serverIndex: number;
  cost: number;
  roi: number; // deltaHashRate / cost — higher is better
}

function getServerHashRate(ns: NS, level: number, ramUsed: number, ram: number, cores: number, mult: number): number {
  // Use formulas if available, otherwise estimate
  if (ns.fileExists("Formulas.exe", "home")) {
    return ns.formulas.hacknetServers.hashGainRate(level, ramUsed, ram, cores, mult);
  }
  // Rough estimate when Formulas.exe unavailable
  const freeRam = Math.max(0, ram - ramUsed);
  return level * 0.001 * freeRam * (1 + (cores - 1) / 5) * mult;
}

function evaluateUpgrades(ns: NS, mult: number, maxServers: number): UpgradeCandidate[] {
  const candidates: UpgradeCandidate[] = [];
  const numNodes = ns.hacknet.numNodes();

  // Evaluate upgrading each existing server
  for (let i = 0; i < numNodes; i++) {
    const stats = ns.hacknet.getNodeStats(i);
    const used = stats.ramUsed ?? 0;
    const currentRate = getServerHashRate(ns, stats.level, used, stats.ram, stats.cores, mult);

    // Level upgrade
    const levelCost = ns.hacknet.getLevelUpgradeCost(i, 1);
    if (isFinite(levelCost) && levelCost > 0) {
      const newRate = getServerHashRate(ns, stats.level + 1, used, stats.ram, stats.cores, mult);
      const roi = (newRate - currentRate) / levelCost;
      candidates.push({ type: "level", serverIndex: i, cost: levelCost, roi });
    }

    // RAM upgrade (doubles RAM)
    const ramCost = ns.hacknet.getRamUpgradeCost(i, 1);
    if (isFinite(ramCost) && ramCost > 0) {
      const newRate = getServerHashRate(ns, stats.level, used, stats.ram * 2, stats.cores, mult);
      const roi = (newRate - currentRate) / ramCost;
      candidates.push({ type: "ram", serverIndex: i, cost: ramCost, roi });
    }

    // Core upgrade
    const coreCost = ns.hacknet.getCoreUpgradeCost(i, 1);
    if (isFinite(coreCost) && coreCost > 0) {
      const newRate = getServerHashRate(ns, stats.level, used, stats.ram, stats.cores + 1, mult);
      const roi = (newRate - currentRate) / coreCost;
      candidates.push({ type: "cores", serverIndex: i, cost: coreCost, roi });
    }

    // Cache upgrade (no hash rate change, but prevents overflow)
    const cacheCost = ns.hacknet.getCacheUpgradeCost(i, 1);
    if (isFinite(cacheCost) && cacheCost > 0) {
      // Cache has 0 production ROI but gets priority when capacity is tight
      candidates.push({ type: "cache", serverIndex: i, cost: cacheCost, roi: 0 });
    }
  }

  // Evaluate buying a new server
  if (numNodes < maxServers) {
    const newNodeCost = ns.hacknet.getPurchaseNodeCost();
    if (isFinite(newNodeCost) && newNodeCost > 0) {
      // New node starts at level 1, 0 used, 1 GB RAM, 1 core
      const newRate = getServerHashRate(ns, 1, 0, 1, 1, mult);
      const roi = newRate / newNodeCost;
      candidates.push({ type: "new", serverIndex: -1, cost: newNodeCost, roi });
    }
  }

  // Sort by ROI descending (cache upgrades sink to bottom unless forced)
  candidates.sort((a, b) => b.roi - a.roi);
  return candidates;
}

// === STATE ===

let nodesBought = 0;
let upgradesBought = 0;
let totalSpent = 0;
let hashesSpentTotal = 0;
let moneyEarnedFromHashes = 0;
const HASH_SELL_NAME = "Sell for Money";
const HASH_SELL_MONEY = 1_000_000; // $1M per sell

// === DAEMON ===

/** @ram 5 */
export async function main(ns: NS): Promise<void> {
  ns.ramOverride(5);
  ns.disableLog("ALL");

  writeDefaultConfig(ns, "hacknet", {
    interval: "5000",
    autoBuy: "true",
    maxServers: "20",
    spendThreshold: "0.5",
    reserveHashes: "0",
    allowWorkers: "false",
  });

  const tierRamCosts = HACKNET_TIERS.map((_, i) => calculateTierRam(ns, i));
  const currentScriptRam = 5;
  let { tier, ramCost } = selectBestTier(
    ns.getServerMaxRam("home") - ns.getServerUsedRam("home") + currentScriptRam,
    tierRamCosts,
  );

  if (ramCost > currentScriptRam) {
    const actual = ns.ramOverride(ramCost);
    if (actual < ramCost) {
      ns.tprint(`WARN: Hacknet daemon could not allocate ${ns.formatRam(ramCost)}, got ${ns.formatRam(actual)}. Running tier 0.`);
      const fallback = selectBestTier(actual, tierRamCosts);
      ns.ramOverride(fallback.ramCost);
      tier = fallback.tier;
      ramCost = fallback.ramCost;
    }
  }

  ns.print(`${C.cyan}Hacknet daemon started${C.reset} — Tier ${tier.tier}: ${tier.name} (${ramCost.toFixed(1)}GB)`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const interval = getConfigNumber(ns, "hacknet", "interval", 5000);
    const autoBuy = getConfigBool(ns, "hacknet", "autoBuy", true);
    const maxServers = getConfigNumber(ns, "hacknet", "maxServers", 20);
    const spendThreshold = getConfigNumber(ns, "hacknet", "spendThreshold", 0.5);
    const reserveHashes = getConfigNumber(ns, "hacknet", "reserveHashes", 0);

    // Read hacknet state
    const numNodes = ns.hacknet.numNodes();
    const maxNodes = ns.hacknet.maxNumNodes();
    const currentHashes = ns.hacknet.numHashes();
    const hashCapacity = ns.hacknet.hashCapacity();
    const hashUtilization = hashCapacity > 0 ? currentHashes / hashCapacity : 0;
    const player = ns.getPlayer();
    const hacknetMult = player.mults.hacknet_node_money;

    // Gather per-server stats
    const servers: HacknetServerInfo[] = [];
    let totalHashRate = 0;
    let totalProduction = 0;
    for (let i = 0; i < numNodes; i++) {
      const stats: NodeStats = ns.hacknet.getNodeStats(i);
      const hashRate = getServerHashRate(ns, stats.level, stats.ramUsed ?? 0, stats.ram, stats.cores, hacknetMult);
      totalHashRate += hashRate;
      totalProduction += stats.totalProduction;
      servers.push({
        index: i,
        level: stats.level,
        ram: stats.ram,
        cores: stats.cores,
        cache: stats.cache ?? 0,
        hashRate,
        hashRateFormatted: ns.formatNumber(hashRate, 3) + " h/s",
        production: stats.totalProduction,
        productionFormatted: ns.formatNumber(stats.totalProduction),
      });
    }

    // Next node cost
    const nextNodeCost = numNodes < maxNodes ? ns.hacknet.getPurchaseNodeCost() : null;

    // Evaluate all upgrade candidates once per cycle
    const candidates = numNodes > 0 ? evaluateUpgrades(ns, hacknetMult, maxServers) : [];

    // Find cheapest upgrade for display
    let cheapestUpgrade: HacknetStatus["cheapestUpgrade"] = null;
    const upgradeOnly = candidates.filter(c => c.type !== "new" && isFinite(c.cost));
    if (upgradeOnly.length > 0) {
      const cheapest = upgradeOnly.reduce((a, b) => a.cost < b.cost ? a : b);
      cheapestUpgrade = {
        type: cheapest.type,
        serverIndex: cheapest.serverIndex,
        cost: cheapest.cost,
        costFormatted: ns.formatNumber(cheapest.cost),
      };
    }

    // Tier 1: Auto-buy — purchase best ROI upgrade within budget
    if (tier.tier >= 1 && autoBuy && numNodes > 0) {
      // If hash utilization > 90%, prioritize cache upgrades
      if (hashUtilization > 0.9) {
        const cacheIdx = candidates.findIndex(c => c.type === "cache");
        if (cacheIdx > 0) {
          const [cacheUpgrade] = candidates.splice(cacheIdx, 1);
          candidates.unshift(cacheUpgrade);
        }
      }

      // Try to purchase the best candidate within budget
      const budget = getBudgetBalance(ns, "hacknet");
      for (const candidate of candidates) {
        if (candidate.cost > budget) continue;
        if (candidate.cost > player.money) continue;

        let success = false;
        let reason = "";
        switch (candidate.type) {
          case "new":
            success = ns.hacknet.purchaseNode() !== -1;
            reason = `New server #${numNodes}`;
            if (success) nodesBought++;
            break;
          case "level":
            success = ns.hacknet.upgradeLevel(candidate.serverIndex, 1);
            reason = `Level +1 on #${candidate.serverIndex}`;
            if (success) upgradesBought++;
            break;
          case "ram":
            success = ns.hacknet.upgradeRam(candidate.serverIndex, 1);
            reason = `RAM x2 on #${candidate.serverIndex}`;
            if (success) upgradesBought++;
            break;
          case "cores":
            success = ns.hacknet.upgradeCore(candidate.serverIndex, 1);
            reason = `Core +1 on #${candidate.serverIndex}`;
            if (success) upgradesBought++;
            break;
          case "cache":
            success = ns.hacknet.upgradeCache(candidate.serverIndex, 1);
            reason = `Cache +1 on #${candidate.serverIndex}`;
            if (success) upgradesBought++;
            break;
        }
        if (success) {
          notifyPurchase(ns, "hacknet", candidate.cost, reason);
          totalSpent += candidate.cost;
          ns.print(`  ${C.green}BOUGHT${C.reset} ${reason} (${ns.formatNumber(candidate.cost)})`);
          break; // One purchase per cycle to stay responsive
        }
      }
    } else if (tier.tier >= 1 && autoBuy && numNodes === 0) {
      // No nodes yet — buy the first one
      const cost = ns.hacknet.getPurchaseNodeCost();
      const budget = getBudgetBalance(ns, "hacknet");
      if (cost <= budget && cost <= player.money) {
        const result = ns.hacknet.purchaseNode();
        if (result !== -1) {
          notifyPurchase(ns, "hacknet", cost, "First hacknet server");
          totalSpent += cost;
          nodesBought++;
          ns.print(`  ${C.green}BOUGHT${C.reset} First hacknet server (${ns.formatNumber(cost)})`);
        }
      }
    }

    // Report remaining costs to budget
    if (tier.tier >= 1) {
      if (candidates.length > 0) {
        const totalRemainingCost = candidates.reduce((sum, c) => sum + (isFinite(c.cost) ? c.cost : 0), 0);
        if (totalRemainingCost > 0) {
          reportCap(ns, "hacknet", totalRemainingCost);
        }
      } else if (nextNodeCost !== null) {
        // No nodes yet — report cost of first node
        reportCap(ns, "hacknet", nextNodeCost);
      }
    }

    // Tier 2: Hash spending — sell for money when above threshold
    if (tier.tier >= 2 && hashCapacity > 0) {
      const currentH = ns.hacknet.numHashes(); // Re-read after potential purchases
      if (currentH / hashCapacity >= spendThreshold) {
        const hashCost = ns.hacknet.hashCost(HASH_SELL_NAME);
        while (ns.hacknet.numHashes() >= hashCost + reserveHashes) {
          if (ns.hacknet.spendHashes(HASH_SELL_NAME)) {
            hashesSpentTotal += hashCost;
            moneyEarnedFromHashes += HASH_SELL_MONEY;
          } else {
            break;
          }
        }
      }
    }

    // Next tier RAM
    const nextTierRam = tier.tier < HACKNET_TIERS.length - 1
      ? tierRamCosts[tier.tier + 1]
      : null;
    const currentPotentialRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home") + ramCost;

    // Re-read post-purchase state
    const updatedNodeCount = ns.hacknet.numNodes();
    const updatedHashes = ns.hacknet.numHashes();
    const updatedNextNodeCost = updatedNodeCount < maxNodes ? ns.hacknet.getPurchaseNodeCost() : null;

    // Build status
    const status: HacknetStatus = {
      tier: tier.tier,
      tierName: tier.name,
      currentRamUsage: ramCost,
      nextTierRam,
      canUpgrade: nextTierRam !== null && currentPotentialRam < nextTierRam,
      availableFeatures: getAvailableFeatures(tier.tier),
      unavailableFeatures: getUnavailableFeatures(tier.tier),

      serverCount: updatedNodeCount,
      maxServers: maxNodes,
      totalHashRate,
      totalHashRateFormatted: ns.formatNumber(totalHashRate, 3) + " h/s",
      currentHashes: updatedHashes,
      hashCapacity,
      hashUtilization: hashCapacity > 0 ? updatedHashes / hashCapacity : 0,
      totalProduction,
      totalProductionFormatted: ns.formatNumber(totalProduction),

      nextNodeCost: updatedNextNodeCost,
      nextNodeCostFormatted: updatedNextNodeCost !== null ? ns.formatNumber(updatedNextNodeCost) : null,
      cheapestUpgrade,

      hashesSpentTotal,
      moneyEarnedFromHashes,
      moneyEarnedFormatted: ns.formatNumber(moneyEarnedFromHashes),
      spendStrategy: "money",
      autoBuy: autoBuy && tier.tier >= 1,

      servers,

      nodesBought,
      upgradesBought,
      totalSpent,
      totalSpentFormatted: ns.formatNumber(totalSpent),
    };

    publishStatus(ns, STATUS_PORTS.hacknet, status);

    // Print summary
    ns.clearLog();
    const mode = status.autoBuy ? `${C.green}AUTO${C.reset}` : `${C.yellow}MONITOR${C.reset}`;
    ns.print(`${C.cyan}═══ Hacknet Daemon ═══${C.reset}  ${mode}  T${tier.tier}:${tier.name}`);
    ns.print(`  Servers: ${status.serverCount}/${maxNodes}`);
    ns.print(`  Hash Rate: ${C.green}${status.totalHashRateFormatted}${C.reset}`);
    if (hashCapacity > 0) {
      const pct = (status.hashUtilization * 100).toFixed(0);
      const hashColor = status.hashUtilization > 0.9 ? C.red : status.hashUtilization > 0.5 ? C.yellow : C.green;
      ns.print(`  Hashes: ${hashColor}${ns.formatNumber(status.currentHashes)}/${ns.formatNumber(hashCapacity)} (${pct}%)${C.reset}`);
    }
    if (tier.tier >= 2 && moneyEarnedFromHashes > 0) {
      ns.print(`  Earned: ${C.green}$${status.moneyEarnedFormatted}${C.reset} from hashes`);
    }
    if (nextNodeCost !== null) {
      ns.print(`  Next Node: ${C.yellow}${ns.formatNumber(nextNodeCost)}${C.reset}`);
    }
    if (totalSpent > 0) {
      ns.print(`  Spent: ${ns.formatNumber(totalSpent)} (${nodesBought} nodes, ${upgradesBought} upgrades)`);
    }

    // Per-server breakdown (compact)
    if (servers.length > 0 && servers.length <= 10) {
      ns.print(`\n  ${C.dim}#   Lvl   RAM     Cores  Cache  Rate${C.reset}`);
      for (const s of servers) {
        ns.print(`  ${String(s.index).padStart(2)}  ${String(s.level).padStart(4)}  ${ns.formatRam(s.ram).padStart(6)}  ${String(s.cores).padStart(5)}  ${String(s.cache).padStart(5)}  ${s.hashRateFormatted}`);
      }
    } else if (servers.length > 10) {
      ns.print(`\n  ${C.dim}${servers.length} servers (showing top 5 by hash rate)${C.reset}`);
      const top = [...servers].sort((a, b) => b.hashRate - a.hashRate).slice(0, 5);
      ns.print(`  ${C.dim}#   Lvl   RAM     Cores  Cache  Rate${C.reset}`);
      for (const s of top) {
        ns.print(`  ${String(s.index).padStart(2)}  ${String(s.level).padStart(4)}  ${ns.formatRam(s.ram).padStart(6)}  ${String(s.cores).padStart(5)}  ${String(s.cache).padStart(5)}  ${s.hashRateFormatted}`);
      }
    }

    await ns.sleep(interval);
  }
}
