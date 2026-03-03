/**
 * Corporation Daemon (RAM-Tiered)
 *
 * Manages corporation automation: Agriculture → Tobacco → Product cycling.
 * Uses dynamic tier selection based on available RAM.
 *
 *   Tier 0 (monitor):  ~119 GB  - Status publishing, phase detection, recommendations
 *   Tier 1 (manage):   ~444 GB  - Auto: employees, materials, tea/party, products, upgrades
 *   Tier 2 (invest):   ~591 GB  - Auto: create corp, expand divisions, investments, go public
 *
 * Corp API RAM costs: getters=10 GB, mutations=20 GB, nextUpdate=1 GB
 *
 * Usage:
 *   run daemons/corp.js
 */
import { NS, CityName } from "@ns";
import { COLORS } from "/lib/utils";
import { publishStatus } from "/lib/ports";
import { writeDefaultConfig, getConfigNumber, getConfigBool, getConfigString } from "/lib/config";
import {
  STATUS_PORTS,
  CORP_CONTROL_PORT,
  CORP_RECOMMENDATIONS_PORT,
  CorpStatus,
  CorpDivisionStatus,
  CorpProductStatus,
  CorpRecommendation,
  CorpControlMessage,
} from "/types/ports";
import { getBudgetBalance, notifyPurchase, signalDone } from "/lib/budget";
import {
  evaluatePhase,
  getPhaseLabel,
  calculateEmployeeDistribution,
  shouldStartNewProduct,
  prioritizeUpgrades,
  evaluateInvestmentOffer,
  CITIES,
  UPGRADE_PRIORITY,
  RESEARCH_PRIORITY,
  EMPLOYEE_JOBS,
} from "/controllers/corp";
import type { CorpStateSnapshot, DivisionSnapshot, WarehouseSnapshot, ProductSnapshot } from "/controllers/corp";

const C = COLORS;

// === TIER DEFINITIONS ===

const BASE_SCRIPT_COST = 1.6;
const RAM_BUFFER_PERCENT = 0.05;

interface CorpTierConfig {
  tier: number;
  name: "monitor" | "manage" | "invest";
  functions: string[];
  features: string[];
}

// Base NS functions used by all tiers (config reading, port access, etc.)
const BASE_FUNCTIONS = [
  "getPlayer",
  "getPortHandle",
  "getServerMaxRam",
  "getServerUsedRam",
  "fileExists",
];

const CORP_TIERS: CorpTierConfig[] = [
  {
    tier: 0,
    name: "monitor",
    functions: [
      "corporation.hasCorporation",
      "corporation.canCreateCorporation",
      "corporation.getCorporation",
      "corporation.getDivision",
      "corporation.hasWarehouse",
      "corporation.getWarehouse",
      "corporation.getMaterial",
      "corporation.getProduct",
      "corporation.getInvestmentOffer",
      "corporation.getUpgradeLevel",
      "corporation.getUpgradeLevelCost",
      "corporation.hasUnlock",
      "corporation.hasResearched",
      "corporation.nextUpdate",
    ],
    features: ["status publishing", "phase detection", "recommendations"],
  },
  {
    tier: 1,
    name: "manage",
    functions: [
      "corporation.getOffice",
      "corporation.hireEmployee",
      "corporation.setAutoJobAssignment",
      "corporation.buyTea",
      "corporation.throwParty",
      "corporation.setSmartSupply",
      "corporation.setProductMarketTA2",
      "corporation.sellProduct",
      "corporation.discontinueProduct",
      "corporation.makeProduct",
      "corporation.sellMaterial",
      "corporation.levelUpgrade",
      "corporation.getResearchCost",
      "corporation.research",
      "corporation.getHireAdVertCost",
      "corporation.hireAdVert",
      "corporation.issueDividends",
      "corporation.upgradeWarehouse",
      "corporation.getUpgradeWarehouseCost",
    ],
    features: ["auto-employees", "auto-materials", "auto-tea", "auto-products", "auto-upgrades"],
  },
  {
    tier: 2,
    name: "invest",
    functions: [
      "corporation.createCorporation",
      "corporation.expandIndustry",
      "corporation.expandCity",
      "corporation.purchaseWarehouse",
      "corporation.purchaseUnlock",
      "corporation.acceptInvestmentOffer",
      "corporation.goPublic",
    ],
    features: ["auto-create", "auto-expand", "auto-invest", "auto-public"],
  },
];

// === TIER RAM CALCULATION ===

function calculateTierRam(ns: NS, tierIndex: number): number {
  let ram = BASE_SCRIPT_COST;
  for (const fn of BASE_FUNCTIONS) {
    ram += ns.getFunctionRamCost(fn);
  }
  for (let i = 0; i <= tierIndex; i++) {
    for (const fn of CORP_TIERS[i].functions) {
      ram += ns.getFunctionRamCost(fn);
    }
  }
  ram *= (1 + RAM_BUFFER_PERCENT);
  return Math.ceil(ram * 10) / 10;
}

function selectBestTier(potentialRam: number, tierRamCosts: number[]): { tier: CorpTierConfig; ramCost: number } {
  let bestTierIndex = 0;
  for (let i = CORP_TIERS.length - 1; i >= 0; i--) {
    if (potentialRam >= tierRamCosts[i]) {
      bestTierIndex = i;
      break;
    }
  }
  return { tier: CORP_TIERS[bestTierIndex], ramCost: tierRamCosts[bestTierIndex] };
}

// === DISMISSED RECOMMENDATION TRACKING ===

const dismissedRecommendations = new Set<string>();

// === STATE ===

let productCounter = 0;
let lastTeaTick = 0;

// === HELPERS ===

function getAvailableFeatures(tier: number): string[] {
  const features: string[] = [];
  for (let i = 0; i <= tier; i++) {
    features.push(...CORP_TIERS[i].features);
  }
  return features;
}

function getUnavailableFeatures(tier: number): string[] {
  const features: string[] = [];
  for (let i = tier + 1; i < CORP_TIERS.length; i++) {
    features.push(...CORP_TIERS[i].features);
  }
  return features;
}

/**
 * Build a complete state snapshot from the Corporation API.
 */
function buildSnapshot(ns: NS): CorpStateSnapshot | null {
  try {
    if (!ns.corporation.hasCorporation()) {
      return {
        hasCorp: false,
        corpName: "",
        funds: 0,
        revenue: 0,
        expenses: 0,
        isPublic: false,
        investmentRound: 0,
        currentOffer: 0,
        investmentShares: 0,
        sharePrice: 0,
        dividendRate: 0,
        issuedShares: 0,
        divisions: [],
        upgradeLevels: {},
        upgradeCosts: {},
        unlocks: {},
        playerMoney: ns.getPlayer().money,
      };
    }

    const corp = ns.corporation.getCorporation();
    const divisions: DivisionSnapshot[] = [];

    for (const divName of corp.divisions) {
      const div = ns.corporation.getDivision(divName);
      const warehouses: WarehouseSnapshot[] = [];
      const products: ProductSnapshot[] = [];

      for (const city of div.cities) {
        try {
          if (ns.corporation.hasWarehouse(divName, city)) {
            const wh = ns.corporation.getWarehouse(divName, city);
            const materials = ["Water", "Chemicals", "Plants", "Food", "Minerals",
              "Ore", "Metal", "Hardware", "Drugs", "Robots", "AI Cores", "Real Estate"]
              .map(name => {
                try {
                  const mat = ns.corporation.getMaterial(divName, city, name);
                  return { name, stored: mat.stored, produced: mat.productionAmount, sold: mat.actualSellAmount };
                } catch { return { name, stored: 0, produced: 0, sold: 0 }; }
              })
              .filter(m => m.stored > 0 || m.produced > 0);

            warehouses.push({
              city,
              size: wh.size,
              used: wh.sizeUsed,
              materials,
            });
          }
        } catch { /* warehouse not available for this city */ }
      }

      // Products (if division makes products)
      if (div.makesProducts) {
        for (const prodName of div.products) {
          try {
            const prod = ns.corporation.getProduct(divName, div.cities[0], prodName);
            products.push({
              name: prod.name,
              progress: prod.developmentProgress,
              rating: prod.rating,
              effectiveRating: prod.effectiveRating,
              demand: prod.demand ?? 0,
              competition: prod.competition ?? 0,
              stored: prod.stored,
              produced: prod.productionAmount,
              sold: prod.actualSellAmount,
              developmentCity: div.cities[0],
            });
          } catch { /* product not accessible */ }
        }
      }

      divisions.push({
        name: div.name,
        type: div.type,
        cities: [...div.cities],
        revenue: div.lastCycleRevenue,
        expenses: div.lastCycleExpenses,
        awareness: div.awareness,
        popularity: div.popularity,
        research: div.researchPoints,
        products,
        warehouses,
        maxProducts: div.maxProducts,
        hasResearch: (name: string) => {
          try { return ns.corporation.hasResearched(divName, name); }
          catch { return false; }
        },
      });
    }

    // Upgrade levels & costs
    const upgradeLevels: Record<string, number> = {};
    const upgradeCosts: Record<string, number> = {};
    for (const name of UPGRADE_PRIORITY) {
      try {
        upgradeLevels[name] = ns.corporation.getUpgradeLevel(name);
        upgradeCosts[name] = ns.corporation.getUpgradeLevelCost(name);
      } catch { /* upgrade not available */ }
    }

    // Unlocks
    const unlockNames = ["Smart Supply", "Warehouse API", "Office API", "Export"];
    const unlocks: Record<string, boolean> = {};
    for (const name of unlockNames) {
      try { unlocks[name] = ns.corporation.hasUnlock(name); }
      catch { unlocks[name] = false; }
    }

    // Investment offer
    let investmentRound = 0;
    let currentOffer = 0;
    let investmentShares = 0;
    try {
      const offer = ns.corporation.getInvestmentOffer();
      investmentRound = offer.round;
      currentOffer = offer.funds;
      investmentShares = offer.shares;
    } catch { /* may not be available */ }

    return {
      hasCorp: true,
      corpName: corp.name,
      funds: corp.funds,
      revenue: corp.revenue,
      expenses: corp.expenses,
      isPublic: corp.public,
      investmentRound,
      currentOffer,
      investmentShares,
      sharePrice: corp.sharePrice,
      dividendRate: corp.dividendRate,
      issuedShares: corp.issuedShares,
      divisions,
      upgradeLevels,
      upgradeCosts,
      unlocks,
      playerMoney: ns.getPlayer().money,
    };
  } catch {
    return null;
  }
}

/**
 * Build formatted division status for dashboard publishing.
 */
function buildDivisionStatuses(ns: NS, divisions: DivisionSnapshot[]): CorpDivisionStatus[] {
  return divisions.map(div => ({
    name: div.name,
    type: div.type,
    cities: div.cities,
    revenue: div.revenue,
    revenueFormatted: ns.formatNumber(div.revenue),
    expenses: div.expenses,
    expensesFormatted: ns.formatNumber(div.expenses),
    profit: div.revenue - div.expenses,
    profitFormatted: ns.formatNumber(div.revenue - div.expenses),
    awareness: div.awareness,
    popularity: div.popularity,
    research: div.research,
    researchFormatted: ns.formatNumber(div.research),
    products: div.products.map(p => ({
      name: p.name,
      progress: p.progress,
      rating: p.rating,
      effectiveRating: p.effectiveRating,
      demand: p.demand,
      competition: p.competition,
      stored: p.stored,
      produced: p.produced,
      sold: p.sold,
      developmentCity: p.developmentCity,
    })),
    warehouses: div.warehouses.map(wh => ({
      city: wh.city,
      size: wh.size,
      used: wh.used,
      usedPercent: wh.size > 0 ? (wh.used / wh.size) * 100 : 0,
      employees: 0, // Filled below if available
    })),
  }));
}

/**
 * Process control port messages.
 * Tier-gated: set-dividend-rate requires T1+, accept-recommendation requires T2+.
 */
function processControlMessages(ns: NS, tierLevel: number): void {
  const port = ns.getPortHandle(CORP_CONTROL_PORT);
  while (!port.empty()) {
    const data = port.read();
    if (data === "NULL PORT DATA") break;
    try {
      const msg = JSON.parse(data as string) as CorpControlMessage;
      switch (msg.action) {
        case "accept-recommendation":
          if (msg.recommendationId && tierLevel >= 2) {
            executeRecommendation(ns, msg.recommendationId);
          }
          break;
        case "dismiss-recommendation":
          if (msg.recommendationId) {
            dismissedRecommendations.add(msg.recommendationId);
          }
          break;
        case "toggle-auto-products":
          if (msg.autoProducts !== undefined) {
            ns.print(`  ${C.cyan}Auto-products: ${msg.autoProducts ? "ON" : "OFF"}${C.reset}`);
          }
          break;
        case "toggle-auto-tea":
          if (msg.autoTea !== undefined) {
            ns.print(`  ${C.cyan}Auto-tea: ${msg.autoTea ? "ON" : "OFF"}${C.reset}`);
          }
          break;
        case "set-dividend-rate":
          if (msg.dividendRate !== undefined && tierLevel >= 1) {
            try {
              ns.corporation.issueDividends(msg.dividendRate);
              ns.print(`  ${C.green}Dividend rate set to ${(msg.dividendRate * 100).toFixed(1)}%${C.reset}`);
            } catch { ns.print(`  ${C.red}Failed to set dividend rate${C.reset}`); }
          }
          break;
      }
    } catch { /* invalid message */ }
  }
}

/** Pending recommendation storage. */
const pendingRecommendations: CorpRecommendation[] = [];

/**
 * Execute a recommendation by ID. Only called at T2+.
 */
function executeRecommendation(ns: NS, recId: string): void {
  const rec = pendingRecommendations.find(r => r.id === recId);
  if (!rec) return;

  try {
    switch (rec.action) {
      case "accept-investment":
        ns.corporation.acceptInvestmentOffer();
        ns.toast("Corporation: Investment accepted!", "success", 3000);
        break;
      case "go-public":
        ns.corporation.goPublic(Number(rec.params.shares) || 0);
        ns.toast("Corporation: Went public!", "success", 3000);
        break;
      case "create-corp":
        ns.corporation.createCorporation(String(rec.params.name || "NovaCorp"), true);
        ns.toast("Corporation: Created!", "success", 3000);
        break;
    }
    dismissedRecommendations.add(recId);
  } catch (e) {
    ns.toast(`Corp action failed: ${e}`, "error", 3000);
  }
}

// === TIER 1: MANAGEMENT AUTOMATION ===

/**
 * Auto-manage employees across all cities of a division.
 * @param canHire - if false, only reassign existing employees (don't hire new ones)
 */
function autoManageEmployees(ns: NS, divSnapshot: DivisionSnapshot, canHire: boolean): void {
  const hasProducts = divSnapshot.products.length > 0;
  const needsResearch = divSnapshot.research < 50000;

  for (const city of divSnapshot.cities) {
    const cn = city as CityName;
    try {
      const office = ns.corporation.getOffice(divSnapshot.name, cn);

      // Hire to fill office — only if allowed (profitable or have Smart Supply)
      if (canHire) {
        while (true) {
          try {
            if (!ns.corporation.hireEmployee(divSnapshot.name, cn)) break;
          } catch { break; }
        }
      }

      const count = office.numEmployees;
      const dist = calculateEmployeeDistribution(count, hasProducts, needsResearch);
      for (const job of EMPLOYEE_JOBS) {
        try {
          ns.corporation.setAutoJobAssignment(divSnapshot.name, cn, job, dist[job]);
        } catch { /* job assignment failed */ }
      }
    } catch { /* office not available */ }
  }
}

/**
 * Auto-buy tea and throw parties for morale.
 */
function autoTeaParty(ns: NS, divName: string, cities: string[], tickCount: number): void {
  // Every 10 ticks (~100s at 10s interval)
  if (tickCount - lastTeaTick < 10) return;
  lastTeaTick = tickCount;

  for (const city of cities) {
    const cn = city as CityName;
    try {
      ns.corporation.buyTea(divName, cn);
    } catch { /* tea purchase failed */ }
    try {
      ns.corporation.throwParty(divName, cn, 500000);
    } catch { /* party failed */ }
  }
}

/**
 * Auto-manage products: sell completed, start new, retire worst.
 */
function autoManageProducts(
  ns: NS,
  div: DivisionSnapshot,
  productInvestment: number,
): void {
  // Set sell for completed products
  for (const prod of div.products) {
    if (prod.progress >= 100) {
      const hasTA2 = div.hasResearch("Market-TA.II");
      for (const city of div.cities) {
        try {
          if (hasTA2) {
            ns.corporation.setProductMarketTA2(div.name, prod.name, true);
          }
          ns.corporation.sellProduct(div.name, city as CityName, prod.name, "MAX", "MP", true);
        } catch { /* sell failed */ }
      }
    }
  }

  // Start new products if needed
  const result = shouldStartNewProduct(div.products, div.maxProducts);
  if (result.shouldStart) {
    // Retire worst product first if needed
    if (result.retireName) {
      try {
        ns.corporation.discontinueProduct(div.name, result.retireName);
        ns.print(`  ${C.yellow}Retired product: ${result.retireName}${C.reset}`);
      } catch { /* discontinue failed */ }
    }

    productCounter++;
    const productName = `Product-${productCounter}`;
    const city = (div.cities[0] || "Sector-12") as CityName;
    try {
      ns.corporation.makeProduct(div.name, city, productName, productInvestment, productInvestment);
      ns.print(`  ${C.green}Started product: ${productName}${C.reset}`);
    } catch { /* make product failed */ }
  }
}

/**
 * Auto-buy corp upgrades (only when profitable or in setup phase).
 */
function autoBuyUpgrades(ns: NS, snapshot: CorpStateSnapshot, hasSmartSupply: boolean): void {
  const phase = evaluatePhase(snapshot);
  const profit = snapshot.revenue - snapshot.expenses;
  const upgrades = prioritizeUpgrades(phase, snapshot.upgradeLevels, snapshot.upgradeCosts, snapshot.funds, profit, hasSmartSupply);
  if (upgrades.length > 0) {
    const best = upgrades[0];
    try {
      ns.corporation.levelUpgrade(best.name);
      ns.print(`  ${C.green}Bought upgrade: ${best.name} → level ${best.level + 1}${C.reset}`);
    } catch { /* upgrade failed */ }
  }
}

/**
 * Auto-purchase research.
 */
function autoResearch(ns: NS, div: DivisionSnapshot): void {
  for (const research of RESEARCH_PRIORITY) {
    if (div.hasResearch(research)) continue;
    try {
      const cost = ns.corporation.getResearchCost(div.name, research);
      if (div.research >= cost * 2) { // Only spend if we have 2x the cost
        ns.corporation.research(div.name, research);
        ns.print(`  ${C.green}Researched: ${research} for ${div.name}${C.reset}`);
      }
    } catch { /* research failed */ }
    break; // Only attempt one research per tick
  }
}

/**
 * Enable Smart Supply on all cities.
 */
function enableSmartSupply(ns: NS, divName: string, cities: string[]): void {
  for (const city of cities) {
    try {
      ns.corporation.setSmartSupply(divName, city as CityName, true);
    } catch { /* smart supply failed */ }
  }
}

// === TIER 2: INVESTMENT AUTOMATION ===

/**
 * Generate recommendation cards for big decisions.
 */
function generateRecommendations(
  ns: NS,
  snapshot: CorpStateSnapshot,
  phase: string,
): CorpRecommendation[] {
  const recs: CorpRecommendation[] = [];

  if (phase === "investment-1" || phase === "investment-2" || phase === "investment-3") {
    // investmentRound is 1-based: the current round offer available
    const round = snapshot.investmentRound;
    const eval_ = evaluateInvestmentOffer(round, snapshot.currentOffer);
    if (eval_.shouldAccept) {
      const id = `invest-round-${round}`;
      if (!dismissedRecommendations.has(id)) {
        recs.push({
          id,
          action: "accept-investment",
          title: `Accept Round ${round} Investment`,
          description: eval_.reason,
          priority: "high",
          params: {},
          estimatedValue: snapshot.currentOffer,
          estimatedValueFormatted: ns.formatNumber(snapshot.currentOffer),
        });
      }
    }
  }

  if (phase === "public") {
    const id = "go-public";
    if (!dismissedRecommendations.has(id)) {
      recs.push({
        id,
        action: "go-public",
        title: "Go Public",
        description: "Corporation is ready to go public. Issue 0 shares to maximize ownership.",
        priority: "high",
        params: { shares: 0 },
        estimatedValue: 0,
        estimatedValueFormatted: "$0",
      });
    }
  }

  if (phase === "not-created" && snapshot.playerMoney >= 150e9) {
    const id = "create-corp";
    if (!dismissedRecommendations.has(id)) {
      recs.push({
        id,
        action: "create-corp",
        title: "Create Corporation",
        description: "You have enough money to self-fund a corporation ($150B).",
        priority: "medium",
        params: { name: "NovaCorp", selfFund: true },
        estimatedValue: 0,
        estimatedValueFormatted: "$0",
      });
    }
  }

  return recs;
}

// === NEXT-STEP TRANSPARENCY ===

interface NextStepInfo {
  nextStep: string;
  nextStepDetail: string;
  manualAction: string | null;
  savingFor: string | null;
  savingForCost: number;
  savingForProgress: number;
}

function computeNextStep(
  phase: string,
  snapshot: CorpStateSnapshot,
  hasSmartSupply: boolean,
): NextStepInfo {
  const info: NextStepInfo = {
    nextStep: "",
    nextStepDetail: "",
    manualAction: null,
    savingFor: null,
    savingForCost: 0,
    savingForProgress: 0,
  };

  switch (phase) {
    case "not-created": {
      const cost = 150e9;
      const progress = Math.min(1, snapshot.playerMoney / cost);
      info.nextStep = `Need $150b to self-fund corporation (${(progress * 100).toFixed(0)}%)`;
      info.nextStepDetail = "Corporation requires $150b to create via self-funding.";
      info.savingFor = "Corporation";
      info.savingForCost = cost;
      info.savingForProgress = progress;
      break;
    }

    case "setup": {
      const agri = snapshot.divisions.find(d => d.type === "Agriculture");
      if (!agri) {
        info.nextStep = "Setting up Agriculture division";
        info.nextStepDetail = "Creating the Agriculture division and expanding to all 6 cities.";
      } else {
        info.nextStep = `Expanding Agriculture to 6 cities (${agri.cities.length}/6)`;
        info.nextStepDetail = "Each city needs expansion + warehouse purchase.";
      }
      break;
    }

    case "agriculture": {
      if (!hasSmartSupply) {
        const cost = 25e9;
        const progress = Math.min(1, snapshot.funds / cost);
        info.nextStep = `Saving for Smart Supply ($25b — ${(progress * 100).toFixed(0)}%)`;
        info.nextStepDetail = "Smart Supply auto-buys production inputs. Without it, divisions produce nothing and bleed wages.";
        info.savingFor = "Smart Supply";
        info.savingForCost = cost;
        info.savingForProgress = progress;
        info.manualAction = "Consider rushing the 'corp' budget bucket";
      } else if (snapshot.revenue === 0) {
        info.nextStep = "Agriculture not producing — hiring employees and enabling Smart Supply";
        info.nextStepDetail = "Sell orders and Smart Supply are set. Employees are being hired. Revenue should appear within a few corp cycles.";
        info.manualAction = "If stuck at $0 revenue, check that employees exist in all cities";
      } else {
        const profit = snapshot.revenue - snapshot.expenses;
        if (profit <= 0) {
          info.nextStep = "Agriculture ramping up — revenue not yet covering expenses";
          info.nextStepDetail = "Production is running but wages exceed sales. Hiring more employees and buying upgrades will increase output.";
        } else {
          info.nextStep = "Agriculture profitable — waiting for investment offer";
          info.nextStepDetail = "Looking for Round 1 investment offer >= $200b.";
        }
      }
      break;
    }

    case "investment-1": {
      const threshold = 200e9;
      const progress = Math.min(1, snapshot.currentOffer / threshold);
      info.nextStep = `Waiting for Round 1 offer >= $200b (current: ${progress >= 0.01 ? (progress * 100).toFixed(0) + "%" : "pending"})`;
      info.nextStepDetail = "Spending frozen — funds accumulate to grow offer value. Higher profit and funds = better offer.";
      info.savingFor = "Round 1 Investment";
      info.savingForCost = threshold;
      info.savingForProgress = progress;
      break;
    }

    case "investment-2": {
      const threshold = 5e12;
      const progress = Math.min(1, snapshot.currentOffer / threshold);
      info.nextStep = `Waiting for Round 2 offer >= $5t (current: ${progress >= 0.01 ? (progress * 100).toFixed(0) + "%" : "pending"})`;
      info.nextStepDetail = "Spending frozen — Tobacco products and research increase the offer value.";
      info.savingFor = "Round 2 Investment";
      info.savingForCost = threshold;
      info.savingForProgress = progress;
      break;
    }

    case "tobacco-setup": {
      const tobacco = snapshot.divisions.find(d => d.type === "Tobacco");
      if (!tobacco) {
        info.nextStep = "Creating Tobacco division";
        info.nextStepDetail = "Expanding into Tobacco industry for product development.";
      } else {
        info.nextStep = `Expanding Tobacco to 6 cities (${tobacco.cities.length}/6)`;
        info.nextStepDetail = "Each city needs expansion + warehouse purchase.";
      }
      break;
    }

    case "product-dev": {
      const tobacco = snapshot.divisions.find(d => d.type === "Tobacco");
      if (tobacco) {
        const developing = tobacco.products.find(p => p.progress < 100);
        if (developing) {
          info.nextStep = `Developing ${developing.name} (${developing.progress.toFixed(0)}%)`;
          info.nextStepDetail = "Products auto-sell when complete. Worst product retired when slots full.";
        } else {
          info.nextStep = "Cycling products — auto-retire worst";
          info.nextStepDetail = "Continuously develops new products, retiring lowest-rated ones.";
        }
      } else {
        info.nextStep = "Product development phase";
        info.nextStepDetail = "Developing and cycling products.";
      }
      break;
    }

    case "investment-3": {
      const threshold = 800e12;
      const progress = Math.min(1, snapshot.currentOffer / threshold);
      info.nextStep = `Waiting for Round 3 offer >= $800t (current: ${progress >= 0.01 ? (progress * 100).toFixed(0) + "%" : "pending"})`;
      info.nextStepDetail = "Spending frozen — product quality and research increase the offer value.";
      info.savingFor = "Round 3 Investment";
      info.savingForCost = threshold;
      info.savingForProgress = progress;
      break;
    }

    case "public": {
      info.nextStep = "Ready to go public — accept recommendation";
      info.nextStepDetail = "Issue 0 shares to maximize ownership and start earning dividends.";
      info.manualAction = "Accept the 'Go Public' recommendation";
      break;
    }

    case "profit": {
      info.nextStep = "Optimizing — auto-cycling products & buying upgrades";
      info.nextStepDetail = "Corporation is self-sustaining. Upgrades and products are managed automatically.";
      break;
    }

    default: {
      info.nextStep = "Unknown phase";
      info.nextStepDetail = "";
    }
  }

  return info;
}

// === DAEMON MAIN ===

/** @ram 5 */
export async function main(ns: NS): Promise<void> {
  ns.ramOverride(5);
  ns.disableLog("ALL");

  writeDefaultConfig(ns, "corp", {
    interval: "10000",
    tier: "2",
    autoProducts: "true",
    autoTea: "true",
    autoMaterials: "true",
    dividendRate: "0.1",
    productInvestment: "1000000000",
    corpName: "NovaCorp",
  });

  // Calculate RAM needed per tier and select best tier for available RAM
  const tierRamCosts = CORP_TIERS.map((_, i) => calculateTierRam(ns, i));
  const currentScriptRam = 5;
  const potentialRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home") + currentScriptRam;

  // Check config preference
  const configTier = getConfigNumber(ns, "corp", "tier", 2);
  const maxTierIndex = Math.min(configTier, CORP_TIERS.length - 1);

  // Select best tier we can afford (up to config limit)
  let { tier, ramCost } = selectBestTier(potentialRam, tierRamCosts);
  if (tier.tier > maxTierIndex) {
    tier = CORP_TIERS[maxTierIndex];
    ramCost = tierRamCosts[maxTierIndex];
  }

  // Check if we can even run the lowest tier
  if (potentialRam < tierRamCosts[0]) {
    ns.tprint(`WARN: Corp daemon needs ${ns.formatRam(tierRamCosts[0])} but only ${ns.formatRam(potentialRam)} available. Cannot start.`);
    return;
  }

  // Re-override RAM to the actual calculated amount
  if (ramCost > currentScriptRam) {
    const actual = ns.ramOverride(ramCost);
    if (actual < tierRamCosts[0]) {
      ns.tprint(`WARN: Corp daemon could not allocate ${ns.formatRam(ramCost)}, got ${ns.formatRam(actual)}. Cannot start.`);
      return;
    }
    // If we got less than desired, pick the best tier we can actually run
    if (actual < ramCost) {
      const fallback = selectBestTier(actual, tierRamCosts);
      tier = fallback.tier;
      ramCost = fallback.ramCost;
    }
  }

  ns.print(`${C.cyan}Corp daemon started${C.reset} — Tier ${tier.tier}: ${tier.name} (${ns.formatRam(ramCost)})`);

  let tickCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const interval = getConfigNumber(ns, "corp", "interval", 10000);
    const autoProducts = getConfigBool(ns, "corp", "autoProducts", true);
    const autoTea = getConfigBool(ns, "corp", "autoTea", true);
    const productInvestment = getConfigNumber(ns, "corp", "productInvestment", 1e9);
    const corpName = getConfigString(ns, "corp", "corpName", "NovaCorp");

    tickCount++;

    // Process control messages
    processControlMessages(ns, tier.tier);

    // Build snapshot
    const snapshot = buildSnapshot(ns);
    if (!snapshot) {
      ns.print(`  ${C.red}Corp API not available${C.reset}`);
      await ns.sleep(interval);
      continue;
    }

    const phase = evaluatePhase(snapshot);
    const phaseLabel = getPhaseLabel(phase);
    const isInvestmentPhase = phase === "investment-1" || phase === "investment-2" || phase === "investment-3";

    // === TIER 2: Auto-create corp ===
    if (tier.tier >= 2 && !snapshot.hasCorp) {
      // Check if player can create via BN3 (free) or self-fund
      try {
        const canCreate = ns.corporation.canCreateCorporation(true);
        // canCreateCorporation returns CreatingCorporationCheckResult enum
        if (canCreate === "Success") {
          const budgetBalance = getBudgetBalance(ns, "corp");
          if (budgetBalance >= 150e9 && snapshot.playerMoney >= 150e9) {
            ns.corporation.createCorporation(corpName, true);
            notifyPurchase(ns, "corp", 150e9, "Corporation created (self-funded)");
            ns.toast(`Corporation "${corpName}" created!`, "success", 3000);
          }
        }
      } catch { /* creation not available */ }
    }

    // Re-check snapshot after potential creation
    const updatedSnapshot = snapshot.hasCorp ? snapshot : buildSnapshot(ns);
    if (!updatedSnapshot) {
      await ns.sleep(interval);
      continue;
    }

    // === TIER 1: Auto-management ===
    const hasSmartSupply = updatedSnapshot.unlocks["Smart Supply"] ?? false;

    if (tier.tier >= 1 && updatedSnapshot.hasCorp) {
      // CRITICAL: Set sell orders ALWAYS (even without Smart Supply)
      // This ensures any stored output materials get sold to generate revenue
      for (const div of updatedSnapshot.divisions) {
        if (div.type === "Agriculture") {
          for (const city of div.cities) {
            for (const mat of ["Plants", "Food"]) {
              try {
                ns.corporation.sellMaterial(div.name, city as CityName, mat, "MAX", "MP");
              } catch { /* sell failed */ }
            }
          }
        }
        // Also sell Tobacco output materials if any are stored
        if (div.type === "Tobacco") {
          for (const city of div.cities) {
            for (const mat of ["Plants", "Food"]) {
              try {
                ns.corporation.sellMaterial(div.name, city as CityName, mat, "MAX", "MP");
              } catch { /* sell failed */ }
            }
          }
        }
      }

      // If Smart Supply is missing, FREEZE all spending — save for it ($25b)
      if (!hasSmartSupply) {
        ns.print(`  ${C.yellow}SAVING for Smart Supply ($25b) — funds: ${ns.formatNumber(updatedSnapshot.funds)}${C.reset}`);
      }

      const isProfitable = updatedSnapshot.revenue > updatedSnapshot.expenses;

      for (const div of updatedSnapshot.divisions) {
        // Employee management: reassign existing, hire NEW when we have Smart Supply
        // (hiring is needed to bootstrap production even before profitability)
        autoManageEmployees(ns, div, hasSmartSupply);

        // Smart Supply enable
        if (hasSmartSupply) {
          enableSmartSupply(ns, div.name, div.cities);
        }

        // Gate all spending behind Smart Supply ownership
        if (hasSmartSupply) {
          // Tea & parties
          if (autoTea) {
            autoTeaParty(ns, div.name, div.cities, tickCount);
          }

          // Product management (Tobacco & other product divisions)
          if (div.products.length > 0 || div.type === "Tobacco") {
            if (autoProducts) {
              autoManageProducts(ns, div, productInvestment);
            }
          }

          // Warehouse overflow recovery: if warehouse is >90% full, upgrade it
          // Skip during investment phases — preserve funds for offer value
          if (!isInvestmentPhase) {
            for (const wh of div.warehouses) {
              const usagePercent = wh.size > 0 ? wh.used / wh.size : 0;
              if (usagePercent > 0.9) {
                try {
                  const upgCost = ns.corporation.getUpgradeWarehouseCost(div.name, wh.city as CityName);
                  if (upgCost < updatedSnapshot.funds * 0.1) {
                    ns.corporation.upgradeWarehouse(div.name, wh.city as CityName);
                    ns.print(`  ${C.green}Upgraded warehouse in ${wh.city}${C.reset}`);
                  }
                } catch { /* upgrade failed */ }
              }
            }
          }

          // Research
          autoResearch(ns, div);
        }
      }

      // Corp upgrades and ads — only if Smart Supply is owned
      // Skip during investment phases — spending funds tanks the offer value
      if (hasSmartSupply && !isInvestmentPhase) {
        autoBuyUpgrades(ns, updatedSnapshot, hasSmartSupply);

        // AdVert hiring (only when profitable, max 5% of excess funds)
        if (updatedSnapshot.revenue > updatedSnapshot.expenses) {
          for (const div of updatedSnapshot.divisions) {
            try {
              const adCost = ns.corporation.getHireAdVertCost(div.name);
              const spendable = Math.max(0, (updatedSnapshot.funds - 10e6) * 0.05);
              if (adCost < spendable) {
                ns.corporation.hireAdVert(div.name);
              }
            } catch { /* advert failed */ }
          }
        }
      }
    }

    // === TIER 2: Auto-expand & invest ===
    if (tier.tier >= 2 && updatedSnapshot.hasCorp) {
      const currentPhase = evaluatePhase(updatedSnapshot);

      // Essential unlocks — Smart Supply is #1 priority, everything else waits
      if (!updatedSnapshot.unlocks["Smart Supply"]) {
        try {
          ns.corporation.purchaseUnlock("Smart Supply");
          ns.print(`  ${C.green}Unlocked Smart Supply${C.reset}`);
        } catch { /* not enough funds yet */ }
      }
      // Only buy secondary unlocks after Smart Supply is secured
      if (updatedSnapshot.unlocks["Smart Supply"]) {
        if (!updatedSnapshot.unlocks["Warehouse API"]) {
          try {
            ns.corporation.purchaseUnlock("Warehouse API");
            ns.print(`  ${C.green}Unlocked Warehouse API${C.reset}`);
          } catch { /* unlock failed */ }
        }
        if (!updatedSnapshot.unlocks["Office API"]) {
          try {
            ns.corporation.purchaseUnlock("Office API");
            ns.print(`  ${C.green}Unlocked Office API${C.reset}`);
          } catch { /* unlock failed */ }
        }
      }

      // All expansion gated behind Smart Supply — don't spend on growth until production works
      // Auto-expand Agriculture to 6 cities
      if (currentPhase === "setup" && hasSmartSupply) {
        const agri = updatedSnapshot.divisions.find(d => d.type === "Agriculture");
        if (!agri) {
          // Create Agriculture division
          try {
            ns.corporation.expandIndustry("Agriculture", "Pony Agriculture");
            ns.print(`  ${C.green}Created Agriculture division${C.reset}`);
          } catch { /* expand failed */ }
        } else {
          for (const city of CITIES) {
            if (!agri.cities.includes(city)) {
              try {
                ns.corporation.expandCity(agri.name, city as CityName);
                ns.print(`  ${C.green}Expanded Agriculture to ${city}${C.reset}`);
              } catch { /* expand failed */ }
              try {
                ns.corporation.purchaseWarehouse(agri.name, city as CityName);
              } catch { /* warehouse failed */ }
              break; // One city per tick
            }
          }
        }
      }

      // Auto-expand Tobacco to 6 cities
      if (currentPhase === "tobacco-setup" && hasSmartSupply) {
        const tobacco = updatedSnapshot.divisions.find(d => d.type === "Tobacco");
        if (!tobacco) {
          try {
            ns.corporation.expandIndustry("Tobacco", "Pony Tobacco");
            ns.print(`  ${C.green}Created Tobacco division${C.reset}`);
          } catch { /* expand failed */ }
        } else {
          for (const city of CITIES) {
            if (!tobacco.cities.includes(city)) {
              try {
                ns.corporation.expandCity(tobacco.name, city as CityName);
                ns.print(`  ${C.green}Expanded Tobacco to ${city}${C.reset}`);
              } catch { /* expand failed */ }
              try {
                ns.corporation.purchaseWarehouse(tobacco.name, city as CityName);
              } catch { /* warehouse failed */ }
              break; // One city per tick
            }
          }
        }
      }
    }

    // Generate recommendations (all tiers)
    const recommendations = generateRecommendations(ns, updatedSnapshot, phase);
    pendingRecommendations.length = 0;
    pendingRecommendations.push(...recommendations);

    // Publish recommendations to port
    const recPort = ns.getPortHandle(CORP_RECOMMENDATIONS_PORT);
    recPort.clear();
    if (recommendations.length > 0) {
      recPort.write(JSON.stringify(recommendations));
    }

    // Build upgrade info
    const upgradeInfo = UPGRADE_PRIORITY.map(name => ({
      name,
      level: updatedSnapshot.upgradeLevels[name] ?? 0,
      cost: updatedSnapshot.upgradeCosts[name] ?? 0,
      costFormatted: ns.formatNumber(updatedSnapshot.upgradeCosts[name] ?? 0),
    }));

    // Build unlock info
    const unlockInfo = ["Smart Supply", "Warehouse API", "Office API", "Export"].map(name => ({
      name,
      unlocked: updatedSnapshot.unlocks[name] ?? false,
    }));

    // Budget
    const budgetBalance = getBudgetBalance(ns, "corp");

    // Compute next-step transparency
    const stepInfo = computeNextStep(phase, updatedSnapshot, hasSmartSupply);

    // Build and publish status
    const status: CorpStatus = {
      tier: tier.tier,
      tierName: tier.name,
      availableFeatures: getAvailableFeatures(tier.tier),
      unavailableFeatures: getUnavailableFeatures(tier.tier),

      hasCorp: updatedSnapshot.hasCorp,
      corpName: updatedSnapshot.corpName,
      phase,
      phaseLabel,

      funds: updatedSnapshot.funds,
      fundsFormatted: ns.formatNumber(updatedSnapshot.funds),
      revenue: updatedSnapshot.revenue,
      revenueFormatted: ns.formatNumber(updatedSnapshot.revenue),
      expenses: updatedSnapshot.expenses,
      expensesFormatted: ns.formatNumber(updatedSnapshot.expenses),
      profit: updatedSnapshot.revenue - updatedSnapshot.expenses,
      profitFormatted: ns.formatNumber(updatedSnapshot.revenue - updatedSnapshot.expenses),

      investmentRound: updatedSnapshot.investmentRound,
      currentOffer: updatedSnapshot.currentOffer,
      currentOfferFormatted: ns.formatNumber(updatedSnapshot.currentOffer),
      investmentShares: updatedSnapshot.investmentShares,

      isPublic: updatedSnapshot.isPublic,
      sharePrice: updatedSnapshot.sharePrice,
      sharePriceFormatted: ns.formatNumber(updatedSnapshot.sharePrice),
      dividendRate: updatedSnapshot.dividendRate,
      issuedShares: updatedSnapshot.issuedShares,

      divisions: buildDivisionStatuses(ns, updatedSnapshot.divisions),
      upgrades: upgradeInfo,
      unlocks: unlockInfo,
      recommendations,

      autoProducts: autoProducts,
      autoTea: autoTea,
      autoMaterials: getConfigBool(ns, "corp", "autoMaterials", true),

      budgetBalance: budgetBalance === Infinity ? -1 : budgetBalance,
      budgetBalanceFormatted: budgetBalance === Infinity ? "unlimited" : ns.formatNumber(budgetBalance),

      nextStep: stepInfo.nextStep,
      nextStepDetail: stepInfo.nextStepDetail,
      manualAction: stepInfo.manualAction,
      savingFor: stepInfo.savingFor,
      savingForCost: stepInfo.savingForCost,
      savingForProgress: stepInfo.savingForProgress,
    };

    publishStatus(ns, STATUS_PORTS.corp, status);

    // Signal done if corp is self-sustaining
    if (updatedSnapshot.hasCorp && updatedSnapshot.revenue > updatedSnapshot.expenses && updatedSnapshot.investmentRound >= 1) {
      signalDone(ns, "corp");
    }

    // Print summary
    ns.clearLog();
    const mode = tier.tier >= 1 ? `${C.green}AUTO${C.reset}` : `${C.yellow}MONITOR${C.reset}`;
    ns.print(`${C.cyan}═══ Corp Daemon ═══${C.reset}  ${mode}  T${tier.tier}:${tier.name}`);
    if (!updatedSnapshot.hasCorp) {
      ns.print(`  ${C.dim}No corporation${C.reset}`);
    } else {
      ns.print(`  ${updatedSnapshot.corpName}  Phase: ${C.cyan}${phaseLabel}${C.reset}`);
      ns.print(`  Funds: ${C.green}${status.fundsFormatted}${C.reset}  Profit: ${status.profit >= 0 ? C.green : C.red}${status.profitFormatted}/s${C.reset}`);
      if (updatedSnapshot.divisions.length > 0) {
        ns.print(`  Divisions: ${updatedSnapshot.divisions.map(d => d.name).join(", ")}`);
      }
      if (recommendations.length > 0) {
        ns.print(`  ${C.yellow}${recommendations.length} pending recommendation(s)${C.reset}`);
      }
    }

    // Wait for next corp update or sleep
    try {
      await ns.corporation.nextUpdate();
    } catch {
      await ns.sleep(interval);
    }
  }
}
