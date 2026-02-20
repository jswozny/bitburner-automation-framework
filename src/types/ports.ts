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
  faction: 9,
  fleet: 10,
  infiltration: 11,
  gang: 13,
  gangTerritory: 14,
  augments: 16,
  advisor: 17,
} as const;

export const GANG_CONTROL_PORT = 15;

export const QUEUE_PORT = 19;
export const COMMAND_PORT = 20;

// === TOOL NAMES ===

export type ToolName = "nuke" | "pserv" | "share" | "rep" | "hack" | "darkweb" | "work" | "faction" | "infiltration" | "gang" | "augments" | "advisor";

// === TOOL SCRIPTS (daemon paths) ===

export const TOOL_SCRIPTS: Record<ToolName, string> = {
  nuke: "daemons/nuke.js",
  pserv: "daemons/pserv.js",
  share: "daemons/share.js",
  rep: "daemons/rep.js",
  hack: "daemons/hack.js",
  darkweb: "daemons/darkweb.js",
  work: "daemons/work.js",
  faction: "daemons/faction.js",
  infiltration: "daemons/infiltration.js",
  gang: "daemons/gang.js",
  augments: "daemons/augments.js",
  advisor: "daemons/advisor.js",
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
  action: "start" | "stop" | "open-tail" | "run-script" | "start-faction-work" | "set-focus" | "start-training" | "install-augments" | "run-backdoors" | "restart-rep-daemon" | "join-faction" | "restart-faction-daemon" | "restart-hack-daemon" | "restart-share-daemon" | "stop-infiltration" | "kill-infiltration" | "configure-infiltration" | "set-gang-strategy" | "pin-gang-member" | "unpin-gang-member" | "ascend-gang-member" | "toggle-gang-purchases" | "toggle-gang-warfare" | "set-gang-wanted-threshold" | "set-gang-ascension-thresholds" | "set-gang-training-threshold" | "set-gang-grow-target" | "set-gang-grow-respect-reserve" | "force-buy-equipment" | "restart-gang-daemon" | "buy-selected-augments";
  scriptPath?: string;
  scriptArgs?: string[];
  factionName?: string;
  workType?: "hacking" | "field" | "security";
  focus?: string;
  factionFocus?: string;
  cityFaction?: string;
  hackStrategy?: HackStrategy;
  hackMaxBatches?: number;
  hackHomeReserve?: number;
  shareTargetPercent?: number;
  infiltrationTarget?: string;
  infiltrationSolvers?: string[];
  infiltrationRewardMode?: "rep" | "money";
  gangStrategy?: GangStrategy;
  gangMemberName?: string;
  gangMemberTask?: string;
  gangPurchasesEnabled?: boolean;
  gangWarfareEnabled?: boolean;
  gangWantedThreshold?: number;
  gangAscendAutoThreshold?: number;
  gangAscendReviewThreshold?: number;
  gangTrainingThreshold?: number;
  gangGrowTargetMultiplier?: number;
  gangGrowRespectReserve?: number;
  selectedAugs?: string[];
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
  fleetRam?: {
    totalMaxRam: string;
    totalUsedRam: string;
    totalFreeRam: string;
    utilization: number;  // 0-100
    serverCount: number;  // rooted servers with RAM > 0
  };
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
  targetPercent?: number;  // 0 or undefined = greedy, 1-100 = capped
}

export interface NonWorkableFactionProgress {
  factionName: string;
  nextAugName: string;
  progress: number;
  currentRep: string;
  requiredRep: string;
}

// === REP DAEMON TIER DEFINITIONS ===

/** Tier names for rep daemon functionality levels */
export type RepTierName = "lite" | "basic" | "target" | "analysis" | "planning" | "prereqs" | "auto-work";

/** Tier configuration for rep daemon */
export interface RepTierConfig {
  /** Tier number (0-6) */
  tier: number;
  /** Human-readable tier name */
  name: RepTierName;
  /**
   * Minimum RAM required for this tier.
   * @deprecated RAM is now calculated dynamically at runtime using calculateTierRam().
   * This field is optional and only used for backward compatibility.
   */
  minRam?: number;
  /**
   * NS function paths needed for this tier (e.g., "singularity.getFactionRep").
   * Used by calculateTierRam() to compute actual RAM cost at runtime.
   */
  functions: string[];
  /** Features available at this tier */
  features: string[];
  /** Description of this tier's capabilities */
  description: string;
}

/** Basic faction rep data (Tier 1+) */
export interface BasicFactionRep {
  name: string;
  currentRep: number;
  currentRepFormatted: string;
  favor: number;
}

export interface RepStatus {
  // === TIER METADATA (always present) ===
  /** Current operating tier (0-6) */
  tier: number;
  /** Tier name (lite, basic, target, etc.) */
  tierName: RepTierName;
  /** Features available at current tier */
  availableFeatures: string[];
  /** Features unavailable due to RAM constraints */
  unavailableFeatures: string[];
  /** RAM being used by this daemon */
  currentRamUsage: number;
  /** RAM that would be needed for next tier */
  nextTierRam: number | null;
  /** Whether higher tier is achievable with more RAM */
  canUpgrade: boolean;

  // === TIER 1+: BASIC REP (optional) ===
  /** All joined factions with basic rep data */
  allFactions?: BasicFactionRep[];

  // === TIER 2+: TARGET TRACKING (optional) ===
  focusedFaction?: string;
  targetFaction?: string;
  nextAugName?: string | null;
  repRequired?: number;
  repRequiredFormatted?: string;
  currentRep?: number;
  currentRepFormatted?: string;
  repGap?: number;
  repGapFormatted?: string;
  repGapPositive?: boolean;
  repProgress?: number;
  nextAugCost?: number;
  nextAugCostFormatted?: string;
  canAffordNextAug?: boolean;
  favor?: number;
  favorToUnlock?: number;

  // === TIER 3+: FACTION ANALYSIS (optional) ===
  /** Available augs per faction (Tier 3+) */
  factionAugs?: {
    faction: string;
    augs: { name: string; repReq: number; repReqFormatted: string }[];
  }[];

  // === TIER 4+: FULL PLANNING (optional) ===
  installedAugs?: number;

  // === TIER 5+: PREREQUISITE AWARENESS (optional) ===
  nonWorkableFactions?: NonWorkableFactionProgress[];

  // === TIER 6: AUTO-WORK (optional) ===
  isWorkingForFaction?: boolean;
  isOptimalWork?: boolean;
  bestWorkType?: "hacking" | "field" | "security";
  currentWorkType?: string | null;
  isWorkable?: boolean;
  pendingBackdoors?: string[];
  repGainRate?: number;
  eta?: string;
}

// === AUGMENTS STATUS ===

export interface AugmentPurchaseEntry {
  name: string;
  faction: string;
  baseCost: number;
  adjustedCost: number;
  baseCostFormatted: string;
  adjustedCostFormatted: string;
  tags: string[];
}

export interface AugmentsStatus {
  available: AugmentPurchaseEntry[];
  sequentialAugs: {
    faction: string;
    augName: string;
    cost: number;
    costFormatted: string;
    canAfford: boolean;
  }[];
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
      repLimited: boolean;
      nextRepRequired: number | null;
      nextRepRequiredFormatted: string | null;
      nextRepGap: number | null;
      nextRepGapFormatted: string | null;
    } | null;
    canDonate: boolean;
    outrightCost: number | null;
    outrightCostFormatted: string | null;
    donationCostForGap: number | null;
    donationCostForGapFormatted: string | null;
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
  pendingAugs: number;
  installedAugs: number;
  playerMoney: number;
  playerMoneyFormatted: string;
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
  isFocused: boolean;
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
    karmaPerMin: number;
    karmaPerMinFormatted: string;
    killsPerMin: number;
    killsPerMinFormatted: string;
  } | null;
  pendingCrimeSwitch: {
    currentCrime: string;
    bestCrime: string;
    currentValue: number;
    bestValue: number;
    currentValueFormatted: string;
    bestValueFormatted: string;
    metric: string;
  } | null;
}

// === HACK STRATEGY ===

export type HackStrategy = "money" | "xp";

// === FLEET ALLOCATION ===

export interface FleetAllocation {
  hackServers: string[];
  shareServers: string[];
  hackStrategy: HackStrategy;
  sharePercent: number;
  totalFleetRam: number;
  hackFleetRam: number;
  shareFleetRam: number;
  timestamp: number;
}

// === BATCH HACKING TYPES ===

export type TargetPhase = "prep" | "batch" | "desync-recovery";

export interface BatchTargetState {
  hostname: string;
  phase: TargetPhase;
  score: number;
  hackPercent: number;
  activeBatches: number;
  totalLanded: number;
  totalFailed: number;
  desyncCount: number;
  prepProgress: number;
  lastBatchLandTime: number | null;
}

export interface BatchTargetStatus {
  rank: number;
  hostname: string;
  phase: TargetPhase;
  score: number;
  scoreFormatted: string;
  hackPercent: number;
  activeBatches: number;
  maxBatches: number;
  totalLanded: number;
  totalFailed: number;
  desyncCount: number;
  prepProgress: number;
  moneyPercent: number;
  moneyDisplay: string;
  securityDelta: string;
  securityClean: boolean;
  incomeRate: number;
  incomeRateFormatted: string;
  eta: string;
  hackThreads: number;
  growThreads: number;
  weakenThreads: number;
  totalThreads: number;
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

  // Batch-mode fields (undefined when running in legacy mode)
  mode?: "legacy" | "batch";
  maxBatches?: number;
  incomePerSec?: number;
  incomePerSecFormatted?: string;
  totalBatchesActive?: number;
  totalBatchesLanded?: number;
  totalBatchesFailed?: number;
  totalDesyncCount?: number;
  preppingCount?: number;
  batchingCount?: number;
  batchTargets?: BatchTargetStatus[];

  // Strategy & share fields
  strategy?: HackStrategy;
  sharePercent?: number;

  // XP mode fields
  xpRate?: number;
  xpRateFormatted?: string;
  xpTarget?: string;
  xpThreads?: number;
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

// === FACTION MANAGER STATUS ===

export interface FactionRequirement {
  label: string;
  met: boolean;
  verifiable: boolean;
}

export interface FactionInfo {
  name: string;
  status: "joined" | "invited" | "not-invited";
  type: "city-exclusive" | "location-locked" | "hacking" | "combat"
      | "endgame" | "megacorp" | "special";
  city?: string;
  hasAugsAvailable?: boolean;
  augCount?: number;
  availableAugCount?: number;
  eligible?: boolean;
  requirements?: FactionRequirement[];
}

export interface FactionStatus {
  // Tier metadata (always present)
  tier: number;
  tierName: string;
  availableFeatures: string[];
  unavailableFeatures: string[];
  currentRamUsage: number;
  nextTierRam: number | null;
  canUpgrade: boolean;

  // Core data (always present)
  factions: FactionInfo[];
  joinedCount: number;
  invitedCount: number;
  notInvitedCount: number;

  // Tier 1+
  pendingInvitations?: string[];

  // Tier 2+
  playerCity?: string;
  playerMoney?: number;
  playerMoneyFormatted?: string;
  playerHacking?: number;
  playerStrength?: number;
  playerDefense?: number;
  playerDexterity?: number;
  playerAgility?: number;
  playerAugsInstalled?: number;
  pendingBackdoors?: { faction: string; server: string; rooted: boolean; haveHacking: boolean }[];

  // Tier 3 (auto-manage)
  preferredCityFaction?: string;
  autoJoined?: string[];
  autoTraveled?: string;
  lastAction?: string;
}

// === INFILTRATION STATE ===

export type InfiltrationState =
  | "IDLE"
  | "QUERYING"
  | "NAVIGATING"
  | "IN_GAME"
  | "SOLVING"
  | "REWARD_SELECT"
  | "COMPLETING"
  | "ERROR"
  | "STOPPING";

export interface InfiltrationLogEntry {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}

export interface InfiltrationLocationInfo {
  name: string;
  city: string;
  difficulty: number;
  maxClearanceLevel: number;
  startingSecurityLevel: number;
  reward: {
    tradeRep: number;
    sellCash: number;
  };
}

export interface InfiltrationStatus {
  state: InfiltrationState;
  paused: boolean;

  currentTarget?: string;
  currentCity?: string;
  currentGame?: number;
  totalGames?: number;
  currentSolver?: string;
  expectedReward?: {
    tradeRep: number;
    sellCash: number;
    faction?: string;
  };

  runsCompleted: number;
  runsFailed: number;
  successRate: number;
  totalRepEarned: number;
  totalCashEarned: number;
  rewardBreakdown: {
    factionRep: number;
    money: number;
  };

  companyStats: Record<string, {
    attempts: number;
    successes: number;
    failures: number;
  }>;

  config: {
    targetCompanyOverride?: string;
    rewardMode: "rep" | "money";
    enabledSolvers: string[];
  };

  log: InfiltrationLogEntry[];

  repVerification?: {
    lastActualDelta: number;
    lastExpectedDelta: number;
    consecutiveZeroDeltas: number;
    totalVerifiedRep: number;
    observedMultiplier: number | null;
    consecutiveLowEfficiency: number;
  };

  error?: {
    message: string;
    solver?: string;
    timestamp: number;
  };

  locations: InfiltrationLocationInfo[];
}

export const INFILTRATION_CONTROL_PORT = 12;

// === GANG TYPES ===

export type GangStrategy = "respect" | "money" | "territory" | "balanced" | "grow";

export type GangTierName = "lite" | "basic" | "full";

export interface GangMemberStatus {
  name: string;
  task: string;
  taskReason?: string;
  str: number;
  def: number;
  dex: number;
  agi: number;
  cha: number;
  hack: number;
  strMultiplier: number;
  defMultiplier: number;
  dexMultiplier: number;
  agiMultiplier: number;
  avgCombatMultiplier: number;
  earnedRespect: number;
  respectGain: number;
  moneyGain: number;
  isPinned: boolean;
  equipmentCount: number;
  ascensionResult?: {
    str: number;
    def: number;
    dex: number;
    agi: number;
    cha: number;
    hack: number;
    bestStat: string;
    bestGain: number;
    action: "auto" | "flag" | "skip";
  };
}

export interface GangTerritoryRival {
  name: string;
  power: number;
  territory: number;
  clashChance: number;
}

export interface GangTerritoryStatus {
  rivals: GangTerritoryRival[];
  ourPower: number;
  ourTerritory: number;
  territoryWarfareEngaged: boolean;
  recommendedAction: "enable" | "disable" | "hold";
  lastChecked: number;
}

export interface GangStatus {
  // Tier metadata
  tier: number;
  tierName: GangTierName;
  availableFeatures: string[];
  unavailableFeatures: string[];
  currentRamUsage: number;
  nextTierRam: number | null;
  canUpgrade: boolean;

  // Core info (always present)
  inGang: boolean;
  faction?: string;
  isHacking?: boolean;

  // Gang aggregates
  respect?: number;
  respectFormatted?: string;
  respectGainRate?: number;
  respectGainRateFormatted?: string;
  wantedLevel?: number;
  wantedPenalty?: number;
  moneyGainRate?: number;
  moneyGainRateFormatted?: string;
  territory?: number;
  territoryWarfareEngaged?: boolean;
  bonusTime?: number;

  // Members
  memberCount?: number;
  maxMembers?: number;
  members?: GangMemberStatus[];
  canRecruit?: boolean;
  recruitsAvailable?: number;
  respectForNextRecruit?: number;
  respectForNextRecruitFormatted?: string;

  // Ascension alerts (Tier 2)
  ascensionAlerts?: { memberName: string; bestStat: string; bestGain: number }[];

  // Equipment (Tier 2)
  purchasingEnabled?: boolean;
  availableUpgrades?: number;
  purchasableEquipment?: { member: string; name: string; cost: number; type: string }[];

  // Territory data (read from territory port)
  territoryData?: GangTerritoryStatus;

  // Config values
  strategy?: GangStrategy;
  wantedThreshold?: number;
  ascendAutoThreshold?: number;
  ascendReviewThreshold?: number;
  trainingThreshold?: number;

  // Grow mode
  growTargetMultiplier?: number;
  growRespectReserve?: number;
  balancedPhase?: "grow" | "respect" | "territory" | "money";
}

// === ADVISOR TYPES ===

export type AdvisorCategory =
  | "infrastructure" | "money" | "skills"
  | "factions" | "augmentations" | "gang";

export interface Recommendation {
  id: string;
  title: string;
  reason: string;
  category: AdvisorCategory;
  score: number;
}

export interface AdvisorStatus {
  recommendations: Recommendation[];
  totalEvaluated: number;
  topCategory: AdvisorCategory | null;
  lastAnalysisMs: number;
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
  factionStatus: FactionStatus | null;
  factionError: string | null;
  fleetAllocation: FleetAllocation | null;
  infiltrationStatus: InfiltrationStatus | null;
  gangStatus: GangStatus | null;
  augmentsStatus: AugmentsStatus | null;
  advisorStatus: AdvisorStatus | null;
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
