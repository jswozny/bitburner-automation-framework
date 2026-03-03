/**
 * Corporation Controller (Pure Logic)
 *
 * Phase evaluation, material optimization, employee distribution,
 * investment analysis, and upgrade prioritization.
 *
 * Zero NS imports — safe to import without RAM cost.
 *
 * Import with: import { evaluatePhase, ... } from "/controllers/corp";
 */

import { CorpPhase } from "/types/ports";

// === CONSTANTS ===

export const CITIES = [
  "Sector-12", "Aevum", "Volhaven",
  "Chongqing", "New Tokyo", "Ishima",
] as const;

export type CityName = typeof CITIES[number];

/** Optimal material ratios for Agriculture warehouses (fills remaining space). */
export const AGRI_MATERIAL_RATIOS: Record<string, number> = {
  Water: 0.5,
  Chemicals: 0.5,
};

/** Material ratios for Tobacco production warehouses. */
export const TOBACCO_MATERIAL_RATIOS: Record<string, number> = {
  Plants: 0.4,
  Water: 0.3,
  Chemicals: 0.15,
  Robots: 0.05,
  "AI Cores": 0.05,
  "Real Estate": 0.05,
};

/** Corp upgrades in priority order. */
export const UPGRADE_PRIORITY: string[] = [
  "Smart Factories",
  "Smart Storage",
  "DreamSense",
  "Wilson Analytics",
  "FocusWires",
  "Neural Accelerators",
  "Speech Processor Implants",
  "Nuoptimal Nootropic Injector Implants",
  "ABC SalesBots",
  "Project Insight",
];

/** Research priorities (ordered). */
export const RESEARCH_PRIORITY: string[] = [
  "Hi-Tech R&D Laboratory",
  "Market-TA.I",
  "Market-TA.II",
  "uPgrade: Fulcrum",
  "uPgrade: Capacity.I",
  "uPgrade: Capacity.II",
];

/** Employee job names. */
export const EMPLOYEE_JOBS = [
  "Operations", "Engineer", "Business", "Management", "Research & Development",
] as const;

// === PHASE THRESHOLDS ===

const INVESTMENT_1_THRESHOLD = 200e9;    // Accept round 1 at $200B+
const INVESTMENT_2_THRESHOLD = 5e12;     // Accept round 2 at $5T+
const INVESTMENT_3_THRESHOLD = 800e12;   // Accept round 3 at $800T+
const CORP_CREATION_COST = 150e9;

// === STATE SNAPSHOTS (controller inputs) ===

export interface MaterialState {
  name: string;
  stored: number;
  produced: number;
  sold: number;
}

export interface WarehouseSnapshot {
  city: string;
  size: number;
  used: number;
  materials: MaterialState[];
}

export interface ProductSnapshot {
  name: string;
  progress: number;
  rating: number;
  effectiveRating: number;
  demand: number;
  competition: number;
  stored: number;
  produced: number;
  sold: number;
  developmentCity: string;
}

export interface DivisionSnapshot {
  name: string;
  type: string;
  cities: string[];
  revenue: number;
  expenses: number;
  awareness: number;
  popularity: number;
  research: number;
  products: ProductSnapshot[];
  warehouses: WarehouseSnapshot[];
  maxProducts: number;
  hasResearch: (name: string) => boolean;
}

export interface CorpStateSnapshot {
  hasCorp: boolean;
  corpName: string;
  funds: number;
  revenue: number;
  expenses: number;
  isPublic: boolean;
  investmentRound: number;
  currentOffer: number;
  investmentShares: number;
  sharePrice: number;
  dividendRate: number;
  issuedShares: number;
  divisions: DivisionSnapshot[];
  upgradeLevels: Record<string, number>;
  upgradeCosts: Record<string, number>;
  unlocks: Record<string, boolean>;
  playerMoney: number;
}

// === ACTION TYPES ===

export interface CorpAction {
  type: string;
  description: string;
  params: Record<string, string | number | boolean>;
  priority: "high" | "medium" | "low";
  estimatedValue: number;
}

export interface MaterialPurchases {
  [material: string]: number;
}

export interface EmployeeAssignment {
  Operations: number;
  Engineer: number;
  Business: number;
  Management: number;
  "Research & Development": number;
}

export interface InvestmentEvaluation {
  shouldAccept: boolean;
  reason: string;
  round: number;
  offer: number;
  threshold: number;
}

export interface UpgradePriority {
  name: string;
  level: number;
  cost: number;
  score: number;
}

// === PHASE EVALUATION ===

/**
 * Determine current corporation phase from game state.
 *
 * NOTE: investmentRound is 1-based from Bitburner API (getInvestmentOffer().round).
 *   round=1 → round 1 offer available (not yet accepted)
 *   round=2 → round 1 accepted, round 2 offer available
 *   round=3 → round 2 accepted, round 3 offer available
 *   round=4 → round 3 accepted, round 4 offer available (go public)
 */
export function evaluatePhase(snapshot: CorpStateSnapshot): CorpPhase {
  if (!snapshot.hasCorp) return "not-created";

  const agri = snapshot.divisions.find(d => d.type === "Agriculture");
  const tobacco = snapshot.divisions.find(d => d.type === "Tobacco");

  // No Agriculture division yet = still setting up
  if (!agri) return "setup";

  // Agriculture exists but not fully expanded
  if (agri.cities.length < 6) return "setup";

  if (snapshot.isPublic) return "profit";

  // Round 4+ available (round 3 accepted) → go public
  if (snapshot.investmentRound >= 4) return "public";

  // Round 3 available (round 2 accepted)
  if (snapshot.investmentRound === 3) {
    if (tobacco && tobacco.products.length > 0) return "investment-3";
    return "product-dev";
  }

  // Round 2 available (round 1 accepted) → need Tobacco
  if (snapshot.investmentRound === 2) {
    if (!tobacco) return "tobacco-setup";
    if (tobacco.cities.length < 6) return "tobacco-setup";
    if (tobacco.products.length === 0) return "product-dev";
    return "investment-2";
  }

  // Round 1 available (no investments accepted yet)
  // GUARD: Don't advance past agriculture if it's not profitable yet.
  const agriProfit = agri.revenue - agri.expenses;
  if (agriProfit <= 0) return "agriculture";

  return "investment-1";
}

/**
 * Get a human-readable label for a phase.
 */
export function getPhaseLabel(phase: CorpPhase): string {
  switch (phase) {
    case "not-created": return "No Corporation";
    case "setup": return "Initial Setup";
    case "agriculture": return "Agriculture Growth";
    case "investment-1": return "Investment Round 1";
    case "investment-2": return "Investment Round 2";
    case "tobacco-setup": return "Tobacco Setup";
    case "product-dev": return "Product Development";
    case "investment-3": return "Investment Round 3";
    case "public": return "Going Public";
    case "profit": return "Profit Optimization";
  }
}

// === MATERIAL CALCULATIONS ===

/**
 * Calculate optimal material buy amounts for Agriculture warehouses.
 */
export function calculateAgriMaterials(
  warehouseSize: number,
  warehouseUsed: number,
): MaterialPurchases {
  const available = warehouseSize - warehouseUsed;
  if (available <= 0) return {};

  const purchases: MaterialPurchases = {};
  for (const [material, ratio] of Object.entries(AGRI_MATERIAL_RATIOS)) {
    const amount = Math.floor(available * ratio);
    if (amount > 0) purchases[material] = amount;
  }
  return purchases;
}

/**
 * Calculate material buy amounts for Tobacco production warehouses.
 */
export function calculateProductionMaterials(
  warehouseSize: number,
  warehouseUsed: number,
): MaterialPurchases {
  const available = warehouseSize - warehouseUsed;
  if (available <= 0) return {};

  const purchases: MaterialPurchases = {};
  for (const [material, ratio] of Object.entries(TOBACCO_MATERIAL_RATIOS)) {
    const amount = Math.floor(available * ratio);
    if (amount > 0) purchases[material] = amount;
  }
  return purchases;
}

// === EMPLOYEE DISTRIBUTION ===

/**
 * Calculate optimal employee distribution for a given count.
 */
export function calculateEmployeeDistribution(
  count: number,
  hasProducts: boolean,
  isResearchPhase: boolean,
): EmployeeAssignment {
  if (count === 0) {
    return { Operations: 0, Engineer: 0, Business: 0, Management: 0, "Research & Development": 0 };
  }

  // Minimal staffing (3 employees)
  if (count <= 3) {
    return {
      Operations: 1,
      Engineer: 1,
      Business: 1,
      Management: 0,
      "Research & Development": 0,
    };
  }

  if (isResearchPhase) {
    // Heavy R&D focus
    const rd = Math.ceil(count * 0.4);
    const eng = Math.ceil(count * 0.2);
    const ops = Math.ceil(count * 0.15);
    const biz = Math.ceil(count * 0.1);
    const mgmt = count - rd - eng - ops - biz;
    return {
      Operations: Math.max(1, ops),
      Engineer: Math.max(1, eng),
      Business: Math.max(1, biz),
      Management: Math.max(0, mgmt),
      "Research & Development": Math.max(1, rd),
    };
  }

  if (hasProducts) {
    // Product-focused: balanced with more engineering
    const eng = Math.ceil(count * 0.25);
    const ops = Math.ceil(count * 0.25);
    const biz = Math.ceil(count * 0.2);
    const mgmt = Math.ceil(count * 0.15);
    const rd = count - eng - ops - biz - mgmt;
    return {
      Operations: Math.max(1, ops),
      Engineer: Math.max(1, eng),
      Business: Math.max(1, biz),
      Management: Math.max(1, mgmt),
      "Research & Development": Math.max(1, rd),
    };
  }

  // Default material production focus
  const ops = Math.ceil(count * 0.3);
  const eng = Math.ceil(count * 0.25);
  const biz = Math.ceil(count * 0.2);
  const mgmt = Math.ceil(count * 0.15);
  const rd = count - ops - eng - biz - mgmt;
  return {
    Operations: Math.max(1, ops),
    Engineer: Math.max(1, eng),
    Business: Math.max(1, biz),
    Management: Math.max(0, mgmt),
    "Research & Development": Math.max(0, rd),
  };
}

// === PRODUCT MANAGEMENT ===

/**
 * Whether to start a new product, and which to retire if at cap.
 */
export function shouldStartNewProduct(
  products: ProductSnapshot[],
  maxProducts: number,
): { shouldStart: boolean; retireName: string | null } {
  const completed = products.filter(p => p.progress >= 100);
  const inDev = products.filter(p => p.progress < 100);

  // If something is still developing, don't start another
  if (inDev.length > 0) return { shouldStart: false, retireName: null };

  // If under the cap, start a new one
  if (products.length < maxProducts) return { shouldStart: true, retireName: null };

  // At cap — retire the worst rated product
  if (completed.length > 0) {
    const worst = completed.reduce((a, b) => a.rating < b.rating ? a : b);
    return { shouldStart: true, retireName: worst.name };
  }

  return { shouldStart: false, retireName: null };
}

/**
 * Get sell price/amount strings for a product.
 */
export function getProductPricing(
  product: ProductSnapshot,
  hasMarketTA2: boolean,
): { sellAmount: string; sellPrice: string } {
  if (hasMarketTA2) {
    return { sellAmount: "MAX", sellPrice: "MP" };
  }
  return { sellAmount: "MAX", sellPrice: "MP" };
}

// === INVESTMENT EVALUATION ===

/**
 * Evaluate whether to accept an investment offer.
 */
export function evaluateInvestmentOffer(
  round: number,
  offer: number,
): InvestmentEvaluation {
  let threshold: number;
  switch (round) {
    case 1: threshold = INVESTMENT_1_THRESHOLD; break;
    case 2: threshold = INVESTMENT_2_THRESHOLD; break;
    case 3: threshold = INVESTMENT_3_THRESHOLD; break;
    default: threshold = Infinity; break;
  }

  const shouldAccept = offer >= threshold;
  const reason = shouldAccept
    ? `Offer ${formatMoney(offer)} exceeds threshold ${formatMoney(threshold)}`
    : `Offer ${formatMoney(offer)} below threshold ${formatMoney(threshold)}`;

  return { shouldAccept, reason, round, offer, threshold };
}

// === UPGRADE PRIORITIZATION ===

/** Minimum funds reserve — never spend below this on upgrades/ads. */
const MIN_FUNDS_RESERVE = 10e6; // $10M

/**
 * Return ranked upgrade list, highest priority first.
 * Only includes upgrades we can afford while keeping a reserve.
 * @param hasSmartSupply - if false, block ALL upgrades (save funds for Smart Supply first)
 */
export function prioritizeUpgrades(
  phase: CorpPhase,
  currentLevels: Record<string, number>,
  costs: Record<string, number>,
  funds: number,
  profit: number,
  hasSmartSupply: boolean = true,
): UpgradePriority[] {
  // Smart Supply is the #1 priority — don't waste corp funds on upgrades until we have it
  if (!hasSmartSupply) return [];

  // Don't buy upgrades when losing money (except during early setup where initial investment funds cover it)
  if (profit < 0 && phase !== "setup") return [];

  // Budget for upgrades: max 20% of funds above reserve
  const spendable = Math.max(0, (funds - MIN_FUNDS_RESERVE) * 0.2);
  if (spendable <= 0) return [];

  const list: UpgradePriority[] = [];

  for (let i = 0; i < UPGRADE_PRIORITY.length; i++) {
    const name = UPGRADE_PRIORITY[i];
    const level = currentLevels[name] ?? 0;
    const cost = costs[name] ?? Infinity;
    if (cost > spendable) continue;

    // Score: higher priority index = lower score, cheaper = higher score
    const positionScore = (UPGRADE_PRIORITY.length - i) * 10;
    const levelPenalty = level * 2;
    const score = positionScore - levelPenalty;

    list.push({ name, level, cost, score });
  }

  list.sort((a, b) => b.score - a.score);
  return list;
}

// === NEXT ACTION ===

/**
 * Determine the best next action for continuous optimization.
 */
export function getNextAction(
  phase: CorpPhase,
  snapshot: CorpStateSnapshot,
): CorpAction | null {
  switch (phase) {
    case "not-created":
      if (snapshot.playerMoney >= CORP_CREATION_COST) {
        return {
          type: "create-corp",
          description: "Create corporation and start Agriculture division",
          params: { selfFund: true },
          priority: "high",
          estimatedValue: 0,
        };
      }
      return null;

    case "setup": {
      const agri = snapshot.divisions.find(d => d.type === "Agriculture");
      if (!agri) {
        return {
          type: "expand-division",
          description: "Create Agriculture division",
          params: { type: "Agriculture", name: "AgriCo" },
          priority: "high",
          estimatedValue: 0,
        };
      }
      const missingCities = CITIES.filter(c => !agri.cities.includes(c));
      if (missingCities.length > 0) {
        return {
          type: "expand-city",
          description: `Expand Agriculture to ${missingCities[0]}`,
          params: { division: agri.name, city: missingCities[0] },
          priority: "high",
          estimatedValue: 0,
        };
      }
      return null;
    }

    case "agriculture": {
      const upgrades = prioritizeUpgrades(phase, snapshot.upgradeLevels, snapshot.upgradeCosts, snapshot.funds, snapshot.revenue - snapshot.expenses);
      if (upgrades.length > 0) {
        return {
          type: "buy-upgrade",
          description: `Buy ${upgrades[0].name} (level ${upgrades[0].level + 1})`,
          params: { name: upgrades[0].name },
          priority: "medium",
          estimatedValue: 0,
        };
      }
      return null;
    }

    case "investment-1":
    case "investment-2":
    case "investment-3": {
      const eval_ = evaluateInvestmentOffer(snapshot.investmentRound + 1, snapshot.currentOffer);
      if (eval_.shouldAccept) {
        return {
          type: "accept-investment",
          description: `Accept round ${snapshot.investmentRound + 1} investment (${formatMoney(snapshot.currentOffer)})`,
          params: {},
          priority: "high",
          estimatedValue: snapshot.currentOffer,
        };
      }
      return null;
    }

    case "tobacco-setup": {
      const tobacco = snapshot.divisions.find(d => d.type === "Tobacco");
      if (!tobacco) {
        return {
          type: "expand-division",
          description: "Create Tobacco division",
          params: { type: "Tobacco", name: "TobaccoCo" },
          priority: "high",
          estimatedValue: 0,
        };
      }
      const missingCities = CITIES.filter(c => !tobacco.cities.includes(c));
      if (missingCities.length > 0) {
        return {
          type: "expand-city",
          description: `Expand Tobacco to ${missingCities[0]}`,
          params: { division: tobacco.name, city: missingCities[0] },
          priority: "high",
          estimatedValue: 0,
        };
      }
      return null;
    }

    case "product-dev": {
      const tobacco = snapshot.divisions.find(d => d.type === "Tobacco");
      if (!tobacco) return null;
      const result = shouldStartNewProduct(tobacco.products, tobacco.maxProducts);
      if (result.shouldStart) {
        return {
          type: "make-product",
          description: `Start developing new product`,
          params: { division: tobacco.name, invest: 1e9, retireName: result.retireName ?? "" },
          priority: "medium",
          estimatedValue: 0,
        };
      }
      return null;
    }

    case "public":
      return {
        type: "go-public",
        description: "Take corporation public",
        params: { shares: 0 },
        priority: "high",
        estimatedValue: 0,
      };

    case "profit": {
      const upgrades = prioritizeUpgrades(phase, snapshot.upgradeLevels, snapshot.upgradeCosts, snapshot.funds, snapshot.revenue - snapshot.expenses);
      if (upgrades.length > 0) {
        return {
          type: "buy-upgrade",
          description: `Buy ${upgrades[0].name} (level ${upgrades[0].level + 1})`,
          params: { name: upgrades[0].name },
          priority: "low",
          estimatedValue: 0,
        };
      }
      return null;
    }
  }
}

// === HELPERS ===

function formatMoney(n: number): string {
  if (n >= 1e15) return `$${(n / 1e15).toFixed(2)}q`;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}t`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}b`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}
