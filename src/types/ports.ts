/**
 * Central Type Definitions and Port Assignments
 *
 * THE single source of truth for all shared types, port numbers, status interfaces,
 * queue definitions, and constants. Zero NS imports. Zero RAM cost.
 *
 * Import with: import { ... } from "/types/ports";
 */

// === PORT ASSIGNMENTS ===

export const STATUS_PORTS = {
  nuke: 1,
  hack: 2,
  pserv: 3,
  share: 4,
  rep: 5,
  work: 6,
  darkweb: 7,
  bitnode: 8,
} as const;

export const QUEUE_PORT = 19;
export const COMMAND_PORT = 20;

// === TOOL NAMES ===

export type ToolName = "nuke" | "pserv" | "share" | "rep" | "hack" | "darkweb" | "work";

// === TOOL SCRIPTS (daemon paths) ===

export const TOOL_SCRIPTS: Record<ToolName, string> = {
  nuke: "daemons/nuke.js",
  pserv: "daemons/pserv.js",
  share: "daemons/share.js",
  rep: "daemons/rep.js",
  hack: "daemons/hack.js",
  darkweb: "daemons/darkweb.js",
  work: "daemons/work.js",
};

// === PRIORITY CONSTANTS ===

export const PRIORITY = {
  CRITICAL: 10,    // install-augments, purchase-augments
  USER_ACTION: 8,  // start-gym, work-for-faction, buy-program
  STATUS_CHECK: 5, // check-work, check-darkweb, check-faction-rep
  NICE_TO_HAVE: 3, // auto-share startup
} as const;

// === QUEUE ENTRY ===

export interface QueueEntry {
  script: string;
  args: (string | number | boolean)[];
  priority: number;
  mode: "force" | "queue";
  timestamp: number;
  requester: string;
  manualFallback?: string;
}

// === COMMAND (React UI -> Dashboard main loop) ===

export interface Command {
  tool: ToolName;
  action: "start" | "stop" | "open-tail" | "run-script" | "start-faction-work" | "set-focus" | "start-training" | "install-augments";
  scriptPath?: string;
  scriptArgs?: string[];
  factionName?: string;
  focus?: string;
}

// === STATUS INTERFACES ===

export interface NukeStatus {
  rootedCount: number;
  totalServers: number;
  toolCount: number;
  ready: { hostname: string; requiredHacking: number; requiredPorts: number }[];
  needHacking: { hostname: string; required: number; current: number }[];
  needPorts: { hostname: string; required: number; current: number }[];
  rooted: string[];
}

export interface PservStatus {
  serverCount: number;
  serverCap: number;
  totalRam: string;
  minRam: string;
  maxRam: string;
  maxPossibleRam: string;
  allMaxed: boolean;
  servers: { hostname: string; ram: number; ramFormatted: string }[];
  maxPossibleRamNum: number;
  upgradeProgress: string;
  nextUpgrade: {
    hostname: string;
    currentRam: string;
    nextRam: string;
    cost: number;
    costFormatted: string;
    canAfford: boolean;
  } | null;
}

export interface ShareStatus {
  totalThreads: string;
  sharePower: string;
  shareRam: string;
  serversWithShare: number;
  serverStats: { hostname: string; threads: string }[];
  cycleStatus: "active" | "cycle" | "idle";
  lastKnownThreads: string;
}

export interface NonWorkableFactionProgress {
  factionName: string;
  nextAugName: string;
  progress: number;
  currentRep: string;
  requiredRep: string;
}

export interface RepStatus {
  targetFaction: string;
  nextAugName: string | null;
  repRequired: number;
  repRequiredFormatted: string;
  currentRep: number;
  currentRepFormatted: string;
  repGap: number;
  repGapFormatted: string;
  repGapPositive: boolean;
  repProgress: number;
  pendingAugs: number;
  installedAugs: number;
  purchasePlan: {
    name: string;
    faction: string;
    baseCost: number;
    adjustedCost: number;
    costFormatted: string;
    adjustedCostFormatted: string;
  }[];
  repGainRate: number;
  eta: string;
  nextAugCost: number;
  nextAugCostFormatted: string;
  canAffordNextAug: boolean;
  favor: number;
  favorToUnlock: number;
  pendingBackdoors: string[];
  hasUnlockedAugs: boolean;
  nonWorkableFactions: NonWorkableFactionProgress[];
  sequentialAugs: {
    faction: string;
    augName: string;
    cost: number;
    costFormatted: string;
    canAfford: boolean;
  }[];
  isWorkingForFaction: boolean;
  isOptimalWork: boolean;
  bestWorkType: "hacking" | "field" | "security";
  currentWorkType: string | null;
  isWorkable: boolean;
  neuroFlux: {
    currentLevel: number;
    bestFaction: string | null;
    hasEnoughRep: boolean;
    canPurchase: boolean;
    currentRep: number;
    currentRepFormatted: string;
    repRequired: number;
    repRequiredFormatted: string;
    repProgress: number;
    repGap: number;
    repGapFormatted: string;
    currentPrice: number;
    currentPriceFormatted: string;
    purchasePlan: {
      startLevel: number;
      endLevel: number;
      purchases: number;
      totalCost: number;
      totalCostFormatted: string;
    } | null;
    canDonate: boolean;
    donationPlan: {
      purchases: number;
      totalDonationCost: number;
      totalDonationCostFormatted: string;
      totalPurchaseCost: number;
      totalPurchaseCostFormatted: string;
      totalCost: number;
      totalCostFormatted: string;
    } | null;
  } | null;
}

export interface DarkwebStatus {
  hasTorRouter: boolean;
  ownedCount: number;
  totalPrograms: number;
  nextProgram: { name: string; cost: number; costFormatted: string } | null;
  moneyUntilNext: number;
  moneyUntilNextFormatted: string;
  canAffordNext: boolean;
  programs: { name: string; cost: number; costFormatted: string; owned: boolean }[];
  allOwned: boolean;
}

export interface WorkStatus {
  currentFocus: string;
  focusLabel: string;
  playerCity: string;
  playerMoney: number;
  playerMoneyFormatted: string;
  skills: {
    strength: number;
    defense: number;
    dexterity: number;
    agility: number;
    hacking: number;
    charisma: number;
    strengthFormatted: string;
    defenseFormatted: string;
    dexterityFormatted: string;
    agilityFormatted: string;
    hackingFormatted: string;
    charismaFormatted: string;
  };
  activityDisplay: string;
  activityType: "gym" | "university" | "crime" | "idle" | "other";
  isTraining: boolean;
  recommendation: {
    type: "gym" | "university" | "crime";
    location: string;
    city: string;
    skill: string;
    skillDisplay: string;
    expMult: number;
    expMultFormatted: string;
    needsTravel: boolean;
    travelCost: number;
    travelCostFormatted: string;
  } | null;
  canTravelToBest: boolean;
  skillTimeSpent: {
    skill: string;
    skillDisplay: string;
    timeMs: number;
    timeFormatted: string;
  }[];
  lowestCombatStat: number;
  highestCombatStat: number;
  combatBalance: number;
  balanceRotation: {
    currentSkill: string;
    currentSkillDisplay: string;
    currentValue: number;
    currentValueFormatted: string;
    lowestSkill: string;
    lowestSkillDisplay: string;
    lowestValue: number;
    lowestValueFormatted: string;
    timeSinceSwitch: number;
    timeUntilEligible: number;
    timeUntilEligibleFormatted: string;
    canSwitch: boolean;
    isTrainingLowest: boolean;
    skillValues: { skill: string; display: string; value: number; valueFormatted: string }[];
  } | null;
  crimeInfo: {
    name: string;
    chance: number;
    chanceFormatted: string;
    moneyPerMin: number;
    moneyPerMinFormatted: string;
    combatExpPerMin: number;
  } | null;
}

export interface HackStatus {
  totalRam: string;
  serverCount: number;
  totalThreads: string;
  activeTargets: number;
  totalTargets: number;
  saturationPercent: number;
  shortestWait: string;
  longestWait: string;
  hackingCount: number;
  growingCount: number;
  weakeningCount: number;
  targets: TargetAssignment[];
  totalExpectedMoney: number;
  totalExpectedMoneyFormatted: string;
  needHigherLevel: { count: number; nextLevel: number } | null;
}

export interface TargetAssignment {
  rank: number;
  hostname: string;
  action: "hack" | "grow" | "weaken";
  assignedThreads: number;
  optimalThreads: number;
  threadsSaturated: boolean;
  moneyPercent: number;
  moneyDisplay: string;
  securityDelta: string;
  securityClean: boolean;
  eta: string;
  expectedMoney: number;
  expectedMoneyFormatted: string;
  totalThreads: number;
  completionEta: string | null;
  hackThreads: number;
  growThreads: number;
  weakenThreads: number;
}

// === BITNODE COMPLETION STATUS ===

export interface BitnodeStatus {
  augmentations: number;
  augmentationsRequired: number;
  money: number;
  moneyRequired: number;
  moneyFormatted: string;
  moneyRequiredFormatted: string;
  hacking: number;
  hackingRequired: number;
  augsComplete: boolean;
  moneyComplete: boolean;
  hackingComplete: boolean;
  allComplete: boolean;
}

// === DASHBOARD STATE ===

export interface DashboardState {
  pids: Record<ToolName, number>;
  nukeStatus: NukeStatus | null;
  pservStatus: PservStatus | null;
  shareStatus: ShareStatus | null;
  repStatus: RepStatus | null;
  repError: string | null;
  hackStatus: HackStatus | null;
  darkwebStatus: DarkwebStatus | null;
  darkwebError: string | null;
  workStatus: WorkStatus | null;
  workError: string | null;
  bitnodeStatus: BitnodeStatus | null;
}

// === PLUGIN INTERFACE (for dashboard) ===

export interface OverviewCardProps<TFormatted> {
  status: TFormatted | null;
  running: boolean;
  toolId: ToolName;
  error?: string | null;
  pid?: number;
}

export interface DetailPanelProps<TFormatted> {
  status: TFormatted | null;
  running: boolean;
  toolId: ToolName;
  error?: string | null;
  pid?: number;
}

// === KILL TIERS (for launcher/queue) ===

export const KILL_TIERS: string[][] = [
  [
    "workers/share.js",
    "workers/hack.js",
    "workers/grow.js",
    "workers/weaken.js",
  ],
  ["daemons/share.js"],
  ["daemons/hack.js"],
  ["views/dashboard/dashboard.js"],
];
