/**
 * Stock Market Daemon (Tiered Architecture)
 *
 * Automated stock trading with three RAM tiers plus hack-aware "smart mode".
 *
 *   Tier 1 (Monitor):    Poll prices, track positions, publish status. No trading.
 *   Tier 2 (Pre-4S):     Moving-average trend detection, buy/sell/short execution.
 *   Tier 3 (4S Trade):   Forecast-based trading with volatility-adjusted thresholds.
 *
 * Smart mode auto-enables when hack daemon publishes status. Reads hack targets
 * and adjusts trading confidence (long positions lose confidence when hacked, etc.).
 *
 * Uses budget daemon for capital allocation (graceful fallback if not running).
 *
 * Usage: run daemons/stocks.js
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import { publishStatus, peekStatus } from "/lib/ports";
import { writeDefaultConfig, getConfigNumber, getConfigBool } from "/lib/config";
import { requestBudget, notifyPurchase, canSpend } from "/lib/budget";
import {
  STATUS_PORTS,
  STOCKS_CONTROL_PORT,
  StocksStatus,
  StocksMode,
  StockPosition,
  StockSignal,
  HackStatus,
  BatchTargetStatus,
} from "/types/ports";
import {
  createPriceHistory,
  addPrice,
  detectTrend,
  forecastSignal,
  calculatePositionSize,
  shouldSell,
  getHackAdjustment,
  getSymbolForServer,
  shouldStopLoss,
  updatePeakPrice,
  PriceHistory,
  PositionTracking,
  StopLossParams,
} from "/controllers/stocks";

const C = COLORS;

// === TIER DEFINITIONS ===

interface StocksTierConfig {
  tier: number;
  name: string;
  functions: string[];
  features: string[];
}

const TIERS: StocksTierConfig[] = [
  {
    tier: 1,
    name: "monitor",
    functions: [
      "stock.getSymbols",
      "stock.getPrice",
      "stock.getPosition",
    ],
    features: ["price-polling", "position-tracking", "status-publishing"],
  },
  {
    tier: 2,
    name: "pre4s",
    functions: [
      "stock.buyStock",
      "stock.sellStock",
      "stock.buyShort",
      "stock.sellShort",
      "stock.getMaxShares",
    ],
    features: ["ma-trading", "long-positions", "short-positions"],
  },
  {
    tier: 3,
    name: "4s",
    functions: [
      "stock.getForecast",
      "stock.getVolatility",
    ],
    features: ["forecast-trading", "volatility-thresholds"],
  },
];

function calculateTierRam(ns: NS): { tier: number; name: string; ramNeeded: number }[] {
  const BASE_RAM = 1.6; // Script base
  let cumulative = BASE_RAM;

  const results: { tier: number; name: string; ramNeeded: number }[] = [];

  for (const t of TIERS) {
    for (const fn of t.functions) {
      cumulative += ns.getFunctionRamCost(fn);
    }
    results.push({ tier: t.tier, name: t.name, ramNeeded: cumulative });
  }

  return results;
}

function selectBestTier(ns: NS): { tier: number; name: string; totalRam: number } {
  const tierRams = calculateTierRam(ns);
  const available = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");

  let best = { tier: 0, name: "disabled", totalRam: 0 };
  for (const t of tierRams) {
    if (t.ramNeeded <= available + 5) { // +5 for overhead tolerance
      best = { tier: t.tier, name: t.name, totalRam: t.ramNeeded };
    }
  }

  return best;
}

// === MAIN ===

/** @ram dynamic */
export async function main(ns: NS): Promise<void> {
  const tierInfo = selectBestTier(ns);

  if (tierInfo.tier === 0) {
    ns.tprint("WARN: Not enough RAM for stock monitor. Need ~30GB for tier 1.");
    return;
  }

  // Override RAM to the exact amount needed for our tier
  ns.ramOverride(Math.ceil(tierInfo.totalRam) + 2);

  await daemon(ns, tierInfo.tier, tierInfo.name);
}

// === STATE ===

interface HeldPosition {
  symbol: string;
  longShares: number;
  longAvgPrice: number;
  shortShares: number;
  shortAvgPrice: number;
}

let realizedProfit = 0;
let tickCount = 0;
let sessionStartOffset = 0;
const priceHistories: Map<string, PriceHistory> = new Map();
const positionTracking: Map<string, PositionTracking> = new Map();
const profitHistory: number[] = []; // Track portfolio value for $/s calc
const MAX_PROFIT_HISTORY = 30;

// === CONTROL PORT ===

interface StocksControlMessage {
  action: string;
  [key: string]: unknown;
}

function readControlPort(ns: NS): StocksControlMessage[] {
  const messages: StocksControlMessage[] = [];
  const port = ns.getPortHandle(STOCKS_CONTROL_PORT);
  while (!port.empty()) {
    const data = port.read();
    if (data === "NULL PORT DATA") break;
    try {
      messages.push(JSON.parse(data as string) as StocksControlMessage);
    } catch {
      // Skip invalid
    }
  }
  return messages;
}

// === API PURCHASE ===

function tryPurchaseAPIs(ns: NS): { hasWSE: boolean; hasTIX: boolean; has4S: boolean } {
  let hasWSE = false;
  let hasTIX = false;
  let has4S = false;

  // Check what we already have by trying to use the functions
  try {
    ns.stock.getSymbols();
    hasTIX = true;
    hasWSE = true;
  } catch {
    // Don't have TIX API
  }

  if (hasTIX) {
    try {
      ns.stock.getForecast(ns.stock.getSymbols()[0]);
      has4S = true;
    } catch {
      // Don't have 4S
    }
  }

  const player = ns.getPlayer();
  const money = player.money;

  // Purchase WSE Account ($200M)
  if (!hasWSE) {
    const cost = 200_000_000;
    if (money >= cost) {
      if (canSpend(ns, "wse-access", cost)) {
        try {
          if (ns.stock.purchaseWseAccount()) {
            hasWSE = true;
            notifyPurchase(ns, "wse-access", cost, "WSE Account");
            ns.print(`  ${C.green}PURCHASED${C.reset} WSE Account`);
          }
        } catch {
          // Not available in this bitnode
        }
      } else {
        requestBudget(ns, "wse-access", cost, "WSE Account", 50);
      }
    }
  }

  // Purchase TIX API ($5B)
  if (hasWSE && !hasTIX) {
    const cost = 5_000_000_000;
    if (money >= cost) {
      if (canSpend(ns, "wse-access", cost)) {
        try {
          if (ns.stock.purchaseTixApi()) {
            hasTIX = true;
            notifyPurchase(ns, "wse-access", cost, "TIX API");
            ns.print(`  ${C.green}PURCHASED${C.reset} TIX API`);
          }
        } catch {
          // Not available
        }
      } else {
        requestBudget(ns, "wse-access", cost, "TIX API", 50);
      }
    }
  }

  // Purchase 4S Market Data TIX API ($25B) — Tier 2 priority
  if (hasTIX && !has4S) {
    const cost = 25_000_000_000;
    if (money >= cost) {
      if (canSpend(ns, "stocks", cost)) {
        try {
          if (ns.stock.purchase4SMarketDataTixApi()) {
            has4S = true;
            notifyPurchase(ns, "stocks", cost, "4S Market Data TIX API");
            ns.print(`  ${C.green}PURCHASED${C.reset} 4S Market Data TIX API`);
          }
        } catch {
          // Not available
        }
      } else {
        requestBudget(ns, "stocks", cost, "4S Market Data TIX API", 25);
      }
    }
  }

  return { hasWSE, hasTIX, has4S };
}

// === HACK AWARENESS ===

function getHackTargets(ns: NS): Map<string, string> {
  const targets = new Map<string, string>();
  const hackStatus = peekStatus<HackStatus>(ns, STATUS_PORTS.hack, 30_000);
  if (!hackStatus) return targets;

  // Batch mode targets
  if (hackStatus.batchTargets) {
    for (const t of hackStatus.batchTargets) {
      targets.set(t.hostname, t.phase);
    }
  }

  // Legacy mode targets
  if (hackStatus.targets) {
    for (const t of hackStatus.targets) {
      targets.set(t.hostname, t.action);
    }
  }

  return targets;
}

// === DAEMON LOOP ===

async function daemon(ns: NS, maxTier: number, tierName: string): Promise<void> {
  ns.disableLog("ALL");

  writeDefaultConfig(ns, "stocks", {
    enabled: "true",
    pollInterval: "6000",
    smartMode: "true",
    preThreshold: "0.03",
    forecastThreshold: "0.01",
    maWindow: "12",
    minConfidence: "0.55",
    maxPositions: "0",
    stopLossPercent: "0.05",
    trailingStopPercent: "0.08",
    maxHoldTicks: "60",
  });

  const enabled = getConfigBool(ns, "stocks", "enabled", true);
  if (!enabled) {
    const disabledStatus: StocksStatus = {
      mode: "disabled", tier: maxTier, tierName,
      hasWSE: false, hasTIX: false, has4S: false,
      portfolioValue: 0, portfolioValueFormatted: "$0",
      totalProfit: 0, totalProfitFormatted: "$0",
      realizedProfit: 0, realizedProfitFormatted: "$0",
      profitPerSec: 0, profitPerSecFormatted: "$0/s",
      longPositions: 0, shortPositions: 0, positions: [],
      signals: [], budgetAllocation: 0, budgetAllocationFormatted: "$0",
      smartMode: false, pollInterval: 0, tickCount: 0,
    };
    publishStatus(ns, STATUS_PORTS.stocks, disabledStatus);
    ns.print(`${C.yellow}Stocks daemon disabled by config${C.reset}`);
    return;
  }

  const pollInterval = getConfigNumber(ns, "stocks", "pollInterval", 6000);
  const smartMode = getConfigBool(ns, "stocks", "smartMode", true);
  const preThreshold = getConfigNumber(ns, "stocks", "preThreshold", 0.03);
  const forecastThreshold = getConfigNumber(ns, "stocks", "forecastThreshold", 0.01);
  const maWindow = getConfigNumber(ns, "stocks", "maWindow", 12);
  const minConfidence = getConfigNumber(ns, "stocks", "minConfidence", 0.55);
  const stopLossParams: StopLossParams = {
    hardStopPercent: getConfigNumber(ns, "stocks", "stopLossPercent", 0.05),
    trailingStopPercent: getConfigNumber(ns, "stocks", "trailingStopPercent", 0.08),
    maxHoldTicks: getConfigNumber(ns, "stocks", "maxHoldTicks", 60),
  };

  // Short selling availability (requires BN8 or SF8.2) — detected on first trade tick
  let canShort = false;
  let shortDetected = false;

  ns.print(
    `${C.cyan}Stocks daemon started${C.reset} tier=${maxTier} (${tierName}) ` +
    `poll=${pollInterval}ms smart=${smartMode}`
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    readControlPort(ns);

    // Attempt to purchase APIs
    const apis = tryPurchaseAPIs(ns);

    if (!apis.hasTIX) {
      // Can't do anything without TIX API — publish waiting status and sleep
      const waitStatus: StocksStatus = {
        mode: "monitor", tier: maxTier, tierName,
        hasWSE: apis.hasWSE, hasTIX: false, has4S: false,
        portfolioValue: 0, portfolioValueFormatted: "$0",
        totalProfit: 0, totalProfitFormatted: "$0",
        realizedProfit: 0, realizedProfitFormatted: "$0",
        profitPerSec: 0, profitPerSecFormatted: "$0/s",
        longPositions: 0, shortPositions: 0, positions: [],
        signals: [], budgetAllocation: 0, budgetAllocationFormatted: "$0",
        smartMode, pollInterval, tickCount,
      };
      publishStatus(ns, STATUS_PORTS.stocks, waitStatus);
      await ns.sleep(pollInterval);
      continue;
    }

    tickCount++;

    // On first tick, snapshot inherited unrealized P&L so the session starts at $0
    if (tickCount === 1) {
      let inheritedPnL = 0;
      for (const sym of ns.stock.getSymbols()) {
        const [longShares, longAvg, shortShares, shortAvg] = ns.stock.getPosition(sym);
        const price = ns.stock.getPrice(sym);
        if (longShares > 0) inheritedPnL += longShares * (price - longAvg);
        if (shortShares > 0) inheritedPnL += shortShares * (shortAvg - price);
      }
      sessionStartOffset = inheritedPnL;
      if (Math.abs(sessionStartOffset) > 0) {
        ns.print(`  ${C.dim}Session P&L offset: ${ns.formatNumber(sessionStartOffset)} (inherited positions)${C.reset}`);
      }
    }

    // Determine effective mode
    const canTrade = maxTier >= 2;
    const can4S = maxTier >= 3 && apis.has4S;
    const mode: StocksMode = can4S ? "4s" : (canTrade ? "pre4s" : "monitor");

    // Get symbols and poll prices
    const symbols = ns.stock.getSymbols();

    // Detect short selling availability once (needs symbols)
    if (!shortDetected && canTrade) {
      shortDetected = true;
      try {
        ns.stock.buyShort(symbols[0], 0);
        canShort = true;
      } catch {
        canShort = false;
      }
      ns.print(`  ${C.dim}Short selling: ${canShort ? "available" : "not available (need BN8/SF8.2)"}${C.reset}`);
    }

    // Get hack targets for smart mode
    const hackTargets = smartMode ? getHackTargets(ns) : new Map<string, string>();

    // Budget allocation
    let budgetAllocation = Infinity;
    if (canTrade) {
      const budgetCheck = canSpend(ns, "stocks", 0);
      // Read actual allocation from budget status
      const budgetStatus = peekStatus<any>(ns, STATUS_PORTS.budget, 30_000);
      if (budgetStatus && budgetStatus.allocations && budgetStatus.allocations.stocks) {
        budgetAllocation = budgetStatus.allocations.stocks.allocated;
      }
      // Request budget for stocks bucket
      requestBudget(ns, "stocks", ns.getPlayer().money * 0.3, "stock investment", 10);
    }

    const positions: StockPosition[] = [];
    const signals: StockSignal[] = [];
    let portfolioValue = 0;
    let unrealizedProfit = 0;
    let longCount = 0;
    let shortCount = 0;

    for (const sym of symbols) {
      const price = ns.stock.getPrice(sym);
      const [longShares, longAvg, shortShares, shortAvg] = ns.stock.getPosition(sym);

      // Update price history
      if (!priceHistories.has(sym)) {
        priceHistories.set(sym, createPriceHistory(maWindow));
      }
      const history = priceHistories.get(sym)!;
      addPrice(history, price);

      // Get forecast if available
      let forecast: number | null = null;
      if (can4S) {
        try {
          forecast = ns.stock.getForecast(sym);
        } catch { /* no 4S access */ }
      }

      // Generate signal
      let signalDir: "long" | "short" | "neutral" = "neutral";
      let signalStrength = 0;
      let maRatio: number | undefined;
      let forecastVal: number | undefined;

      if (forecast !== null) {
        const sig = forecastSignal(forecast, minConfidence);
        signalDir = sig.direction;
        signalStrength = sig.strength;
        forecastVal = forecast;
      } else {
        const sig = detectTrend(history, preThreshold);
        signalDir = sig.direction;
        signalStrength = sig.strength;
        maRatio = sig.maRatio;
      }

      // Apply hack adjustment in smart mode
      let hackAdj = "";
      if (smartMode && signalDir !== "neutral") {
        const adj = getHackAdjustment(sym, signalDir, hackTargets);
        signalStrength *= adj.confidenceMultiplier;
        if (adj.reason) hackAdj = adj.reason;
      }

      // Track existing positions
      if (longShares > 0) {
        longCount++;
        const profit = longShares * (price - longAvg);
        unrealizedProfit += profit;
        portfolioValue += longShares * price;
        positions.push({
          symbol: sym,
          shares: longShares,
          avgPrice: longAvg,
          currentPrice: price,
          direction: "long",
          profit,
          profitFormatted: ns.formatNumber(profit),
          confidence: signalStrength,
          hackAdjustment: hackAdj || undefined,
        });

        // Initialize tracking for inherited positions
        const longKey = `${sym}-long`;
        if (!positionTracking.has(longKey)) {
          positionTracking.set(longKey, {
            entryPrice: longAvg,
            peakPrice: price,
            ticksHeld: 0,
            direction: "long",
          });
        }
        const tracking = positionTracking.get(longKey)!;
        tracking.ticksHeld++;
        tracking.peakPrice = updatePeakPrice(price, tracking);

        // Check stop-loss before signal-based sell
        let sold = false;
        if (canTrade) {
          const stopCheck = shouldStopLoss(price, tracking, stopLossParams);
          if (stopCheck.shouldExit) {
            const saleProfit = ns.stock.sellStock(sym, longShares);
            if (saleProfit > 0) {
              realizedProfit += (saleProfit - longAvg * longShares);
              positionTracking.delete(longKey);
              notifyPurchase(ns, "stocks", 0, `Sold ${sym} LONG (${stopCheck.reason})`);
              ns.print(`  ${C.red}STOP ${stopCheck.reason.toUpperCase()}${C.reset} ${sym} LONG: ${ns.formatNumber(saleProfit)}`);
              sold = true;
            }
          }
          // Check signal-based sell
          if (!sold && shouldSell("long", forecast, maRatio ?? null, forecastThreshold, preThreshold)) {
            const saleProfit = ns.stock.sellStock(sym, longShares);
            if (saleProfit > 0) {
              realizedProfit += (saleProfit - longAvg * longShares);
              positionTracking.delete(longKey);
              notifyPurchase(ns, "stocks", 0, `Sold ${sym} LONG`);
              ns.print(`  ${C.green}SELL LONG${C.reset} ${sym}: ${ns.formatNumber(saleProfit)}`);
            }
          }
        }
      }

      if (shortShares > 0) {
        shortCount++;
        const profit = shortShares * (shortAvg - price);
        unrealizedProfit += profit;
        portfolioValue += shortShares * shortAvg; // Cost basis
        positions.push({
          symbol: sym,
          shares: shortShares,
          avgPrice: shortAvg,
          currentPrice: price,
          direction: "short",
          profit,
          profitFormatted: ns.formatNumber(profit),
          confidence: signalStrength,
          hackAdjustment: hackAdj || undefined,
        });

        // Initialize tracking for inherited positions
        const shortKey = `${sym}-short`;
        if (!positionTracking.has(shortKey)) {
          positionTracking.set(shortKey, {
            entryPrice: shortAvg,
            peakPrice: price,
            ticksHeld: 0,
            direction: "short",
          });
        }
        const tracking = positionTracking.get(shortKey)!;
        tracking.ticksHeld++;
        tracking.peakPrice = updatePeakPrice(price, tracking);

        // Check stop-loss before signal-based sell
        let sold = false;
        if (canTrade && canShort) {
          const stopCheck = shouldStopLoss(price, tracking, stopLossParams);
          if (stopCheck.shouldExit) {
            const saleProfit = ns.stock.sellShort(sym, shortShares);
            if (saleProfit > 0) {
              realizedProfit += (shortAvg * shortShares - saleProfit);
              positionTracking.delete(shortKey);
              notifyPurchase(ns, "stocks", 0, `Sold ${sym} SHORT (${stopCheck.reason})`);
              ns.print(`  ${C.red}STOP ${stopCheck.reason.toUpperCase()}${C.reset} ${sym} SHORT: ${ns.formatNumber(saleProfit)}`);
              sold = true;
            }
          }
          // Check signal-based sell
          if (!sold && shouldSell("short", forecast, maRatio ?? null, forecastThreshold, preThreshold)) {
            const saleProfit = ns.stock.sellShort(sym, shortShares);
            if (saleProfit > 0) {
              realizedProfit += (shortAvg * shortShares - saleProfit);
              positionTracking.delete(shortKey);
              notifyPurchase(ns, "stocks", 0, `Sold ${sym} SHORT`);
              ns.print(`  ${C.yellow}SELL SHORT${C.reset} ${sym}: ${ns.formatNumber(saleProfit)}`);
            }
          }
        }
      }

      // Open new positions
      if (canTrade && signalDir !== "neutral" && signalStrength > 0.1) {
        const maxShares = ns.stock.getMaxShares(sym);
        const availCash = Math.min(ns.getPlayer().money * 0.5, budgetAllocation);
        const sharesToBuy = calculatePositionSize(signalStrength, availCash, maxShares, price);

        if (sharesToBuy > 0) {
          if (signalDir === "long" && longShares === 0) {
            const cost = ns.stock.buyStock(sym, sharesToBuy);
            if (cost > 0) {
              positionTracking.set(`${sym}-long`, {
                entryPrice: cost,
                peakPrice: cost,
                ticksHeld: 0,
                direction: "long",
              });
              notifyPurchase(ns, "stocks", cost * sharesToBuy, `Buy ${sym} LONG`);
              ns.print(`  ${C.green}BUY LONG${C.reset} ${sym}: ${sharesToBuy} @ ${ns.formatNumber(cost)}`);
            }
          } else if (signalDir === "short" && shortShares === 0 && canShort) {
            const cost = ns.stock.buyShort(sym, sharesToBuy);
            if (cost > 0) {
              positionTracking.set(`${sym}-short`, {
                entryPrice: cost,
                peakPrice: cost,
                ticksHeld: 0,
                direction: "short",
              });
              notifyPurchase(ns, "stocks", cost * sharesToBuy, `Buy ${sym} SHORT`);
              ns.print(`  ${C.cyan}BUY SHORT${C.reset} ${sym}: ${sharesToBuy} @ ${ns.formatNumber(cost)}`);
            }
          }
        }
      }

      // Record signal for non-held stocks
      if (longShares === 0 && shortShares === 0 && signalDir !== "neutral") {
        signals.push({
          symbol: sym,
          direction: signalDir,
          strength: signalStrength,
          forecast: forecastVal,
          maRatio,
        });
      }
    }

    // Calculate profit/sec (subtract inherited P&L so session starts at $0)
    const totalProfit = realizedProfit + unrealizedProfit - sessionStartOffset;
    profitHistory.push(totalProfit);
    if (profitHistory.length > MAX_PROFIT_HISTORY) profitHistory.shift();

    let profitPerSec = 0;
    if (profitHistory.length >= 2) {
      const oldest = profitHistory[0];
      const newest = profitHistory[profitHistory.length - 1];
      const timeSpanSec = (profitHistory.length - 1) * (pollInterval / 1000);
      if (timeSpanSec > 0) {
        profitPerSec = (newest - oldest) / timeSpanSec;
      }
    }

    // Sort signals by strength
    signals.sort((a, b) => b.strength - a.strength);

    // Build status
    const status: StocksStatus = {
      mode,
      tier: maxTier,
      tierName,
      hasWSE: apis.hasWSE,
      hasTIX: apis.hasTIX,
      has4S: apis.has4S,
      portfolioValue,
      portfolioValueFormatted: ns.formatNumber(portfolioValue),
      totalProfit,
      totalProfitFormatted: ns.formatNumber(totalProfit),
      realizedProfit,
      realizedProfitFormatted: ns.formatNumber(realizedProfit),
      profitPerSec,
      profitPerSecFormatted: ns.formatNumber(profitPerSec) + "/s",
      longPositions: longCount,
      shortPositions: shortCount,
      positions: positions.sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit)),
      signals: signals.slice(0, 10),
      budgetAllocation: budgetAllocation === Infinity ? -1 : budgetAllocation,
      budgetAllocationFormatted: budgetAllocation === Infinity ? "unlimited" : ns.formatNumber(budgetAllocation),
      smartMode,
      pollInterval,
      tickCount,
    };

    publishStatus(ns, STATUS_PORTS.stocks, status);

    ns.print(
      `${C.cyan}=== Stocks ===${C.reset} ` +
      `[${mode.toUpperCase()}] ` +
      `Pos: ${longCount}L/${shortCount}S | ` +
      `Value: ${ns.formatNumber(portfolioValue)} | ` +
      `P&L: ${ns.formatNumber(totalProfit)} | ` +
      `${ns.formatNumber(profitPerSec)}/s`
    );

    await ns.sleep(pollInterval);
  }
}
