/**
 * Dashboard Types and Interfaces
 *
 * Shared types for the modular dashboard architecture.
 */
import React from "lib/react";
import { NS } from "@ns";

// === TOOL NAMES ===

export type ToolName = "nuke" | "pserv" | "share" | "rep" | "hack";

// === TOOL SCRIPTS ===

export const TOOL_SCRIPTS: Record<ToolName, string> = {
  nuke: "auto/auto-nuke.js",
  pserv: "auto/auto-pserv.js",
  share: "auto/auto-share.js",
  rep: "auto/auto-rep.js",
  hack: "hack/distributed.js",
};

// === COMMAND TYPES ===

export interface DashboardCommand {
  type: "toggle" | "tab";
  tool?: ToolName | "all";
  action?: "start" | "stop";
  tab?: number;
}

export interface PendingCommand {
  tool: ToolName;
  action: "start" | "stop";
}

// === FORMATTED STATUS TYPES ===

export interface FormattedNukeStatus {
  rootedCount: number;
  totalServers: number;
  toolCount: number;
  ready: { hostname: string; requiredHacking: number; requiredPorts: number }[];
  needHacking: { hostname: string; required: number; current: number }[];
  needPorts: { hostname: string; required: number; current: number }[];
  rooted: string[];
}

export interface FormattedPservStatus {
  serverCount: number;
  serverCap: number;
  totalRam: string;
  minRam: string;
  maxRam: string;
  maxPossibleRam: string;
  allMaxed: boolean;
  servers: { hostname: string; ram: number; ramFormatted: string }[];
  maxPossibleRamNum: number;
}

export interface FormattedShareStatus {
  totalThreads: string;
  sharePower: string;
  shareRam: string;
  serversWithShare: number;
  serverStats: { hostname: string; threads: string }[];
}

export interface FormattedRepStatus {
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
}

export interface FormattedHackStatus {
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
  targets: FormattedTargetAssignment[];
  totalExpectedMoney: number;
  totalExpectedMoneyFormatted: string;
  needHigherLevel: { count: number; nextLevel: number } | null;
}

export interface FormattedTargetAssignment {
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
}

// === DASHBOARD STATE ===

export interface DashboardState {
  pids: Record<ToolName, number>;
  nukeStatus: FormattedNukeStatus | null;
  pservStatus: FormattedPservStatus | null;
  shareStatus: FormattedShareStatus | null;
  repStatus: FormattedRepStatus | null;
  repError: string | null;
  hackStatus: FormattedHackStatus | null;
}

// === PLUGIN INTERFACE ===

export interface ToolPlugin<TFormatted> {
  /** Display name e.g., "NUKE" */
  name: string;

  /** Identifier e.g., "nuke" */
  id: ToolName;

  /** Script path e.g., "/auto/auto-nuke.js" */
  script: string;

  /** Fetch and format status (called in main loop before React) */
  getFormattedStatus: (ns: NS, extra?: PluginContext) => TFormatted | null;

  /** Overview card for the main dashboard */
  OverviewCard: React.ComponentType<OverviewCardProps<TFormatted>>;

  /** Detailed panel when tab is selected */
  DetailPanel: React.ComponentType<DetailPanelProps<TFormatted>>;
}

export interface PluginContext {
  playerMoney?: number;
  repGainRate?: number;
  favorToUnlock?: number;
}

export interface OverviewCardProps<TFormatted> {
  status: TFormatted | null;
  running: boolean;
  toolId: ToolName;
  error?: string | null;
}

export interface DetailPanelProps<TFormatted> {
  status: TFormatted | null;
  running: boolean;
  toolId: ToolName;
  error?: string | null;
}
