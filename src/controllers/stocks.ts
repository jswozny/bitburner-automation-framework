/**
 * Stocks Controller (Pure Logic)
 *
 * Trend detection, signal generation, position sizing, confidence calculation,
 * and server→symbol mapping. Zero NS imports — safe to import without RAM cost.
 *
 * Import with: import { ... } from "/controllers/stocks";
 */

// === SERVER → SYMBOL MAPPING ===

/**
 * Bitburner's fixed mapping of server hostnames to stock symbols.
 * Used for hack daemon awareness (smart mode).
 */
const SERVER_TO_SYMBOL: Record<string, string> = {
  "ecorp": "ECP",
  "megacorp": "MGCP",
  "blade": "BLD",
  "clarkinc": "CLRK",
  "omnitek": "OMTK",
  "4sigma": "FSIG",
  "kuai-gong": "KGI",
  "fulcrumtech": "FLCM",
  "stormtech": "STM",
  "defcomm": "DCOMM",
  "helios": "HLS",
  "vitalife": "VITA",
  "icarus": "ICRS",
  "univ-energy": "UNV",
  "aerocorp": "AERO",
  "omnia": "OMN",
  "solaris": "SLRS",
  "global-pharm": "GPH",
  "nova-med": "NVMD",
  "lexo-corp": "LXO",
  "rho-construction": "RHOC",
  "alpha-ent": "APHE",
  "syscore": "SYSC",
  "computek": "CTK",
  "netlink": "NTLK",
  "omega-net": "OMGA",
  "foodnstuff": "FNS",
  "joesguns": "JGN",
  "sigma-cosmetics": "SGC",
  "catalyst": "CTYS",
  "microdyne": "MDYN",
  "titan-labs": "TITN",
};

const SYMBOL_TO_SERVER: Record<string, string> = {};
for (const [server, symbol] of Object.entries(SERVER_TO_SYMBOL)) {
  SYMBOL_TO_SERVER[symbol] = server;
}

export function getSymbolForServer(hostname: string): string | null {
  return SERVER_TO_SYMBOL[hostname] ?? null;
}

export function getServerForSymbol(symbol: string): string | null {
  return SYMBOL_TO_SERVER[symbol] ?? null;
}

// === MOVING AVERAGE ===

export interface PriceHistory {
  prices: number[];
  maxLength: number;
}

export function createPriceHistory(maxLength: number): PriceHistory {
  return { prices: [], maxLength };
}

export function addPrice(history: PriceHistory, price: number): void {
  history.prices.push(price);
  if (history.prices.length > history.maxLength) {
    history.prices.shift();
  }
}

export function getMovingAverage(history: PriceHistory): number | null {
  if (history.prices.length < 2) return null;
  const sum = history.prices.reduce((a, b) => a + b, 0);
  return sum / history.prices.length;
}

/**
 * Estimate volatility from price history as standard deviation of tick-to-tick returns.
 * Returns null if not enough data points (need at least 3 prices for 2 returns).
 */
export function estimateVolatility(history: PriceHistory): number | null {
  if (history.prices.length < 3) return null;

  const returns: number[] = [];
  for (let i = 1; i < history.prices.length; i++) {
    if (history.prices[i - 1] > 0) {
      returns.push((history.prices[i] - history.prices[i - 1]) / history.prices[i - 1]);
    }
  }
  if (returns.length < 2) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

// === TREND DETECTION (PRE-4S) ===

export interface TrendSignal {
  direction: "long" | "short" | "neutral";
  strength: number;  // 0-1, higher = stronger signal
  maRatio: number;   // price / MA ratio
}

/**
 * Generate a trend signal from price history using moving average crossover.
 */
export function detectTrend(
  history: PriceHistory,
  threshold: number,
): TrendSignal {
  const ma = getMovingAverage(history);
  if (ma === null || history.prices.length < 3) {
    return { direction: "neutral", strength: 0, maRatio: 1 };
  }

  const currentPrice = history.prices[history.prices.length - 1];
  const maRatio = currentPrice / ma;
  const deviation = maRatio - 1;

  if (deviation > threshold) {
    // Price above MA → uptrend → long
    return {
      direction: "long",
      strength: Math.min(1, deviation / (threshold * 5)),
      maRatio,
    };
  } else if (deviation < -threshold) {
    // Price below MA → downtrend → short
    return {
      direction: "short",
      strength: Math.min(1, Math.abs(deviation) / (threshold * 5)),
      maRatio,
    };
  }

  return { direction: "neutral", strength: 0, maRatio };
}

// === EXPECTED RETURN ===

/**
 * Calculate expected return per tick for a stock.
 * Positive = long signal, negative = short signal, magnitude = return per share per tick.
 *
 * This is the core metric used by every successful Bitburner stock script:
 *   expectedReturn = volatility × (forecast - 0.5)
 */
export function calcExpectedReturn(
  forecast: number,
  volatility: number,
): number {
  return volatility * (forecast - 0.5);
}

// === 4S / SCRAPED FORECAST SIGNALS ===

export interface ForecastSignal {
  direction: "long" | "short" | "neutral";
  strength: number;      // absReturn (expected return magnitude)
  forecast: number;
  expectedReturn: number; // signed expected return per tick
}

/**
 * Generate a signal from forecast data using expected return.
 * Buy filter: |expectedReturn| > buyThreshold.
 */
export function forecastSignal(
  forecast: number,
  volatility: number,
  buyThreshold: number,
): ForecastSignal {
  const expectedReturn = calcExpectedReturn(forecast, volatility);
  const absReturn = Math.abs(expectedReturn);

  if (absReturn > buyThreshold) {
    return {
      direction: expectedReturn > 0 ? "long" : "short",
      strength: absReturn,
      forecast,
      expectedReturn,
    };
  }

  return { direction: "neutral", strength: 0, forecast, expectedReturn };
}

// === POSITION SIZING ===

/**
 * Calculate the per-stock budget based on diversification cap.
 * Divides the trading capital (budget allowance) evenly across maxPositions.
 */
export function calcDiversifiedBudget(
  tradingCapital: number,
  maxPositions: number,
): number {
  if (maxPositions <= 0) return tradingCapital;
  return tradingCapital / maxPositions;
}

/**
 * Calculate position size: full allocation up to diversification cap.
 * Signal-strength scaling removed — qualifying signals get full allocation,
 * and diversification handles risk management.
 */
export function calculatePositionSize(
  availableCash: number,
  maxShares: number,
  pricePerShare: number,
): number {
  if (pricePerShare <= 0 || availableCash <= 0) return 0;

  const sharesByBudget = Math.floor(availableCash / pricePerShare);
  return Math.min(sharesByBudget, maxShares);
}

// === SELL THRESHOLDS ===

/**
 * Check if a position should be sold based on trailing threshold.
 * Returns true if the signal has reversed past the threshold.
 */
export function shouldSell(
  position: "long" | "short",
  currentForecast: number | null,
  currentMaRatio: number | null,
  forecastThreshold: number,
  preThreshold: number,
): boolean {
  // 4S mode: use forecast directly
  if (currentForecast !== null) {
    if (position === "long" && currentForecast < (0.5 - forecastThreshold)) return true;
    if (position === "short" && currentForecast > (0.5 + forecastThreshold)) return true;
    return false;
  }

  // Pre-4S mode: use MA ratio
  if (currentMaRatio !== null) {
    if (position === "long" && currentMaRatio < (1 - preThreshold)) return true;
    if (position === "short" && currentMaRatio > (1 + preThreshold)) return true;
    return false;
  }

  return false;
}

// === STOP-LOSS / TRAILING STOP ===

export interface StopLossParams {
  hardStopPercent: number;    // e.g. 0.05 = 5% hard stop from entry
  trailingStopPercent: number; // e.g. 0.08 = 8% trailing stop from peak
  maxHoldTicks: number;        // e.g. 60 = sell after 60 ticks
}

export interface PositionTracking {
  entryPrice: number;
  peakPrice: number;
  ticksHeld: number;
  direction: "long" | "short";
}

export interface StopLossResult {
  shouldExit: boolean;
  reason: string;
}

/**
 * Check if a position should be exited due to stop-loss conditions.
 */
export function shouldStopLoss(
  currentPrice: number,
  tracking: PositionTracking,
  params: StopLossParams,
): StopLossResult {
  // Time limit check first
  if (params.maxHoldTicks > 0 && tracking.ticksHeld >= params.maxHoldTicks) {
    return { shouldExit: true, reason: "time-limit" };
  }

  if (tracking.direction === "long") {
    // Hard stop: price dropped hardStopPercent from entry
    if (params.hardStopPercent > 0) {
      const stopPrice = tracking.entryPrice * (1 - params.hardStopPercent);
      if (currentPrice <= stopPrice) {
        return { shouldExit: true, reason: "hard-stop" };
      }
    }
    // Trailing stop: price dropped trailingStopPercent from peak
    if (params.trailingStopPercent > 0) {
      const trailPrice = tracking.peakPrice * (1 - params.trailingStopPercent);
      if (currentPrice <= trailPrice) {
        return { shouldExit: true, reason: "trailing-stop" };
      }
    }
  } else {
    // Short positions: inverse logic (price rising is bad)
    if (params.hardStopPercent > 0) {
      const stopPrice = tracking.entryPrice * (1 + params.hardStopPercent);
      if (currentPrice >= stopPrice) {
        return { shouldExit: true, reason: "hard-stop" };
      }
    }
    if (params.trailingStopPercent > 0) {
      const trailPrice = tracking.peakPrice * (1 + params.trailingStopPercent);
      if (currentPrice >= trailPrice) {
        return { shouldExit: true, reason: "trailing-stop" };
      }
    }
  }

  return { shouldExit: false, reason: "" };
}

/**
 * Update the peak price for a tracked position.
 * For longs: peak = max seen price. For shorts: peak = min seen price.
 */
export function updatePeakPrice(
  currentPrice: number,
  tracking: PositionTracking,
): number {
  if (tracking.direction === "long") {
    return Math.max(tracking.peakPrice, currentPrice);
  } else {
    return Math.min(tracking.peakPrice, currentPrice);
  }
}

// === HACK AWARENESS (SMART MODE) ===

export interface HackAdjustment {
  confidenceMultiplier: number;
  reason: string;
}

/**
 * Adjust trading confidence based on hack daemon activity.
 *
 * @param symbol - Stock symbol being evaluated
 * @param direction - Position direction (long or short)
 * @param hackTargets - Map of server hostname → phase (prep/batch/etc.)
 */
export function getHackAdjustment(
  symbol: string,
  direction: "long" | "short",
  hackTargets: Map<string, string>,
): HackAdjustment {
  const server = getServerForSymbol(symbol);
  if (!server) return { confidenceMultiplier: 1, reason: "" };

  const phase = hackTargets.get(server);
  if (!phase) return { confidenceMultiplier: 1, reason: "" };

  if (phase === "batch") {
    // Server is being actively hacked → reduces money → stock goes down
    if (direction === "long") {
      return { confidenceMultiplier: 0.5, reason: "hacked" };
    } else {
      return { confidenceMultiplier: 1.3, reason: "hacked" };
    }
  }

  if (phase === "prep") {
    // Server is being grown → money increases → stock goes up
    if (direction === "long") {
      return { confidenceMultiplier: 1.2, reason: "growing" };
    } else {
      return { confidenceMultiplier: 0.7, reason: "growing" };
    }
  }

  return { confidenceMultiplier: 1, reason: "" };
}
