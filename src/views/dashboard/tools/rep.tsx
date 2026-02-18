/**
 * Rep Tool Plugin
 *
 * Displays reputation progress with ETA, progress bar, and running totals.
 * Supports tiered display based on daemon operating tier.
 */
import React from "lib/react";
import { NS } from "@ns";
import { ToolPlugin, FormattedRepStatus, OverviewCardProps, DetailPanelProps, PluginContext } from "views/dashboard/types";
import { styles } from "views/dashboard/styles";
import { ToolControl } from "views/dashboard/components/ToolControl";
import { ProgressBar } from "views/dashboard/components/ProgressBar";
import { getRepStatus, findNextWorkableAugmentation, getNonWorkableFactionProgress, getFactionWorkStatus, getSequentialPurchaseAugs, getNeuroFluxInfo, calculateNeuroFluxPurchasePlan, canDonateToFaction, calculateNFGDonatePurchasePlan, getGangFaction } from "/controllers/factions";
import { formatTime } from "lib/utils";
import { runScript, startFactionWork, installAugments, runBackdoors, restartRepDaemon, getPluginUIState, setPluginUIState } from "views/dashboard/state-store";
import { peekStatus } from "lib/ports";
import { STATUS_PORTS, RepStatus } from "types/ports";

// === REP TRACKING STATE (module-level) ===

let lastRep = 0;
let lastRepTime = Date.now();
let repGainRate = 0;
let lastTargetFaction = "";

// === FACTION BACKDOOR SERVERS ===

const FACTION_BACKDOOR_SERVERS: Record<string, string> = {
  "CyberSec": "CSEC",
  "NiteSec": "avmnite-02h",
  "The Black Hand": "I.I.I.I",
  "BitRunners": "run4theh111z",
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

// === STATUS FORMATTING ===

function formatRepStatus(ns: NS, extra?: PluginContext): FormattedRepStatus | null {
  // First, try to read from port (the daemon publishes tiered status)
  const portStatus = peekStatus<RepStatus>(ns, STATUS_PORTS.rep);

  if (portStatus && portStatus.tier !== undefined) {
    // Return port status directly - it already has tier info
    return portStatus;
  }

  // Fallback: compute status directly (full mode only)
  try {
    const player = ns.getPlayer();
    const raw = getRepStatus(ns, player);

    // Detect gang faction to exclude from auto-targeting
    const gangFaction = getGangFaction(ns);
    const gangExclude = gangFaction ? new Set([gangFaction]) : undefined;

    // Use workable faction target instead of any faction (excluding gang)
    const target = findNextWorkableAugmentation(raw.factionData, gangExclude);

    // Get non-workable faction progress (include gang faction)
    const nonWorkableProgress = getNonWorkableFactionProgress(raw.factionData, gangExclude);

    // Get NeuroFlux info early - we may need it as fallback
    const nfInfo = getNeuroFluxInfo(ns);

    // If no regular aug target, fall back to best NFG faction for favor grinding
    let targetFaction: string;
    let targetFactionData: { currentRep: number; favor: number } | null = null;

    if (target) {
      targetFaction = target.faction.name;
      targetFactionData = { currentRep: target.faction.currentRep, favor: target.faction.favor };
    } else if (nfInfo.bestFaction) {
      // Fall back to best NFG faction for favor/rep grinding (skip gang faction)
      let nfgWorkFaction = nfInfo.bestFaction;
      if (gangFaction && nfgWorkFaction === gangFaction) {
        const altFaction = raw.factionData
          .filter(f => f.name !== gangFaction)
          .sort((a, b) => b.currentRep - a.currentRep)
          .find(f => {
            try { return ns.singularity.getAugmentationsFromFaction(f.name).includes("NeuroFlux Governor"); } catch { return false; }
          });
        if (altFaction) nfgWorkFaction = altFaction.name;
      }
      targetFaction = nfgWorkFaction;
      const factionData = raw.factionData.find(f => f.name === nfgWorkFaction);
      targetFactionData = factionData ? { currentRep: factionData.currentRep, favor: factionData.favor } : null;
    } else {
      targetFaction = "None";
    }

    const repRequired = target?.aug?.repReq ?? 0;
    const currentRep = target?.faction?.currentRep ?? targetFactionData?.currentRep ?? 0;
    const repGap = Math.max(0, repRequired - currentRep);
    const repProgress = repRequired > 0 ? Math.min(1, currentRep / repRequired) : 0;

    const favorToUnlock = extra?.favorToUnlock ?? 150;
    const playerMoney = extra?.playerMoney ?? player.money;

    // Update rep gain rate tracking internally
    const now = Date.now();

    if (targetFaction !== "None") {
      if (lastRep > 0 && lastTargetFaction === targetFaction) {
        const timeDelta = (now - lastRepTime) / 1000;
        if (timeDelta > 0) {
          const repDelta = currentRep - lastRep;
          repGainRate = repGainRate * 0.7 + (repDelta / timeDelta) * 0.3;
        }
      }
      lastRep = currentRep;
      lastRepTime = now;
      lastTargetFaction = targetFaction;
    }

    // Calculate ETA
    let eta = "???";
    if (repGap > 0 && repGainRate > 0) {
      eta = formatTime(repGap / repGainRate);
    } else if (repGap <= 0) {
      eta = "Ready";
    }

    const nextAugCost = target?.aug?.basePrice ?? 0;

    // Get pending backdoors
    const pendingBackdoors = getPendingBackdoors(ns);

    // Check if there are unlocked augs to buy
    const hasUnlockedAugs = raw.purchasePlan.length > 0;

    // Get work status for target faction
    const workStatus = targetFaction !== "None"
      ? getFactionWorkStatus(ns, player, targetFaction)
      : { isWorkingForFaction: false, isOptimalWork: false, bestWorkType: "hacking" as const, currentWorkType: null, isWorkable: false };

    // Get sequential purchase augs (Shadows of Anarchy, etc.)
    const sequentialAugs = getSequentialPurchaseAugs(ns, raw.factionData, playerMoney);

    // Build full status (tier 6 equivalent)
    const nfPlan = calculateNeuroFluxPurchasePlan(ns, playerMoney);
    const nfRepProgress = nfInfo.repRequired > 0 ? Math.min(1, nfInfo.bestFactionRep / nfInfo.repRequired) : 0;
    const nfRepGap = Math.max(0, nfInfo.repRequired - nfInfo.bestFactionRep);
    const canDonate = nfInfo.bestFaction ? canDonateToFaction(ns, nfInfo.bestFaction) : false;
    const donatePlan = canDonate ? calculateNFGDonatePurchasePlan(ns, playerMoney) : null;

    // Note: When running as fallback (daemon not active), RAM usage is estimated.
    // The daemon calculates actual RAM dynamically based on SF4 level.
    return {
      tier: 6,
      tierName: "auto-work",
      availableFeatures: ["cached-display", "live-rep", "all-factions", "target-tracking", "eta", "aug-cost", "faction-augs", "auto-recommend", "purchase-plan", "owned-filter", "prereq-order", "nfg-tracking", "auto-work", "work-status"],
      unavailableFeatures: [],
      currentRamUsage: 0, // Actual value comes from daemon when running
      nextTierRam: null,
      canUpgrade: false,
      allFactions: raw.factionData.map(f => ({
        name: f.name,
        currentRep: f.currentRep,
        currentRepFormatted: ns.formatNumber(f.currentRep),
        favor: f.favor,
      })),
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
      pendingAugs: raw.pendingAugs.length,
      installedAugs: raw.installedAugs.length,
      purchasePlan: raw.purchasePlan.map(item => ({
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
      favor: targetFactionData?.favor ?? 0,
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
      neuroFlux: {
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
      },
    };
  } catch {
    return null;
  }
}

// === TIER DISPLAY HELPERS ===

const TIER_COLORS: Record<number, string> = {
  0: "#888888", // lite - gray
  1: "#00aa00", // basic - green
  2: "#00aaaa", // target - cyan
  3: "#0088ff", // analysis - blue
  4: "#aa00aa", // planning - purple
  5: "#ff8800", // prereqs - orange
  6: "#00ff00", // auto-work - bright green
};

const TIER_LABELS: Record<number, string> = {
  0: "Lite",
  1: "Basic",
  2: "Target",
  3: "Analysis",
  4: "Planning",
  5: "Prereqs",
  6: "Full",
};

// === COMPONENTS ===

function RepOverviewCard({ status, running, toolId, error, pid }: OverviewCardProps<FormattedRepStatus>): React.ReactElement {
  const tier = status?.tier ?? 0;
  const tierColor = TIER_COLORS[tier] ?? "#888";
  const tierLabel = TIER_LABELS[tier] ?? "Unknown";

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>REP</span>
        <ToolControl tool={toolId} running={running} error={!!error} pid={pid} />
      </div>
      {error ? (
        <div style={{ color: "#ffaa00", fontSize: "11px" }}>{error}</div>
      ) : (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Target</span>
            <span style={styles.statHighlight}>{status?.targetFaction ?? "—"}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Pending Augs</span>
            <span style={styles.statValue}>{status?.pendingAugs ?? "—"}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Unlocked</span>
            <span style={styles.statValue}>{status?.purchasePlan?.length ?? "—"}</span>
          </div>
        </>
      )}
    </div>
  );
}

function RepDetailPanel({ status, error, running, toolId, pid }: DetailPanelProps<FormattedRepStatus>): React.ReactElement {
  if (error) {
    return (
      <div style={styles.panel}>
        <ToolControl tool={toolId} running={running} error={true} pid={pid} />
        <div style={{ color: "#ffaa00", marginTop: "12px" }}>{error}</div>
        <div style={{ ...styles.dim, marginTop: "8px", fontSize: "11px" }}>
          Requires Singularity API (Source-File 4)
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div style={styles.panel}>
        <div style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.statLabel}>REP Daemon</span>
          </div>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
        {!running ? (
          <>
            <div style={{ marginTop: "12px", color: "#ffaa00" }}>
              REP daemon not running.
            </div>
            <div style={{ ...styles.dim, marginTop: "8px", fontSize: "11px" }}>
              Click to start the daemon and load rep status.
            </div>
          </>
        ) : (
          <>
            <div style={{ marginTop: "12px", color: "#ffaa00" }}>
              Waiting for status...
            </div>
            <div style={{ ...styles.dim, marginTop: "8px", fontSize: "11px" }}>
              Daemon may be starting up. Check the daemon's tail log for details.
            </div>
          </>
        )}
      </div>
    );
  }

  // Tier-aware rendering
  const tier = status.tier ?? 6;
  const tierColor = TIER_COLORS[tier] ?? "#888";
  const tierLabel = TIER_LABELS[tier] ?? "Unknown";

  // High tier (3+): Full display
  if (tier >= 3) {
    return <HighTierDetailPanel status={status} running={running} toolId={"rep"} pid={pid} tierColor={tierColor} tierLabel={tierLabel} />;
  }

  // Low tier (0-2): Basic display
  return <LowTierDetailPanel status={status} running={running} toolId={"rep"} pid={pid} tierColor={tierColor} tierLabel={tierLabel} />;
}

// === LOW TIER PANEL (0-2) ===

function LowTierDetailPanel({
  status,
  running,
  toolId,
  pid,
  tierColor,
  tierLabel,
}: {
  status: FormattedRepStatus;
  running: boolean;
  toolId: "rep";
  pid?: number;
  tierColor: string;
  tierLabel: string;
}): React.ReactElement {
  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span style={styles.statLabel}>REP Daemon</span>
          <span style={{ color: tierColor, fontSize: "11px", marginLeft: "8px" }}>
            Tier {status.tier}: {tierLabel}
          </span>
        </div>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>

      {/* RAM Info */}
      <div style={{
        ...styles.card,
        backgroundColor: "rgba(100, 100, 100, 0.15)",
        borderLeft: `3px solid ${tierColor}`,
        marginTop: "8px",
      }}>
        <div style={{ color: tierColor, fontSize: "11px", marginBottom: "6px" }}>
          LIMITED FUNCTIONALITY MODE
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>RAM Usage</span>
          <span style={styles.statValue}>{status.currentRamUsage}GB</span>
        </div>
        {status.nextTierRam && (
          <div style={styles.stat}>
            <span style={styles.statLabel}>Next Tier Needs</span>
            <span style={{ color: "#ffaa00" }}>{status.nextTierRam}GB</span>
          </div>
        )}
        <div style={{ ...styles.dim, fontSize: "10px", marginTop: "6px" }}>
          Features: {status.availableFeatures?.join(", ") ?? "none"}
        </div>
        {status.unavailableFeatures && status.unavailableFeatures.length > 0 && (
          <div style={{ color: "#888", fontSize: "10px", marginTop: "4px" }}>
            Missing: {status.unavailableFeatures.slice(0, 4).join(", ")}
            {status.unavailableFeatures.length > 4 && ` +${status.unavailableFeatures.length - 4} more`}
          </div>
        )}
      </div>

      {/* All Factions List (Tier 1+) */}
      {status.allFactions && status.allFactions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            JOINED FACTIONS
            <span style={{ ...styles.dim, marginLeft: "8px", fontWeight: "normal" }}>
              {status.allFactions.length} total
            </span>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Faction</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Rep</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Favor</th>
              </tr>
            </thead>
            <tbody>
              {status.allFactions.slice(0, 10).map((faction, i) => (
                <tr key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <td style={{ ...styles.tableCell, color: "#fff" }}>
                    {faction.name.substring(0, 24)}
                  </td>
                  <td style={{ ...styles.tableCell, textAlign: "right", color: "#00ff00" }}>
                    {faction.currentRepFormatted}
                  </td>
                  <td style={{ ...styles.tableCell, textAlign: "right", color: "#888" }}>
                    {faction.favor.toFixed(0)}
                  </td>
                </tr>
              ))}
              {status.allFactions.length > 10 && (
                <tr style={styles.tableRowAlt}>
                  <td style={{ ...styles.tableCell, ...styles.dim }} colSpan={3}>
                    ... +{status.allFactions.length - 10} more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Lite mode message (Tier 0) */}
      {status.tier === 0 && (
        <div style={{ marginTop: "12px", color: "#888", fontSize: "11px" }}>
          No live data available. Need SF4 (Singularity) for faction rep tracking.
        </div>
      )}
    </div>
  );
}

// === HIGH TIER PANEL (3+) ===

function HighTierDetailPanel({
  status,
  running,
  toolId,
  pid,
  tierColor,
  tierLabel,
}: {
  status: FormattedRepStatus;
  running: boolean;
  toolId: "rep";
  pid?: number;
  tierColor: string;
  tierLabel: string;
}): React.ReactElement {
  // Calculate affordable count and total
  let runningTotal = 0;
  const purchaseWithTotals = (status.purchasePlan ?? []).map(item => {
    runningTotal += item.adjustedCost;
    return { ...item, runningTotal };
  });
  const totalCost = runningTotal;

  const handleBuyAugs = () => {
    runScript("rep", "actions/purchase-augments.js", []);
  };

  const handleBackdoors = () => {
    runBackdoors();
  };

  const handleStartWork = () => {
    if (status.targetFaction && status.targetFaction !== "None" && status.bestWorkType) {
      startFactionWork(status.targetFaction, status.bestWorkType);
    }
  };

  // Show work button when: workable faction, not optimal work, and still need rep
  const showWorkButton = status.isWorkable && !status.isOptimalWork && status.repGapPositive;

  // Install augments confirmation state
  const confirmInstall = getPluginUIState<boolean>("rep", "confirmInstall", false);
  const handleInstallAugs = () => {
    if (confirmInstall) {
      installAugments();
      setPluginUIState("rep", "confirmInstall", false);
    } else {
      setPluginUIState("rep", "confirmInstall", true);
    }
  };
  const handleInstallBlur = () => {
    setPluginUIState("rep", "confirmInstall", false);
  };

  // NeuroFlux buy handler
  const handleBuyNFG = () => {
    runScript("rep", "actions/purchase-neuroflux.js", []);
  };

  // NeuroFlux donate & buy handler
  const handleDonateAndBuyNFG = () => {
    runScript("rep", "actions/neuroflux-donate.js", ["--confirm"]);
  };

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>Target: </span>
            <select
              style={{
                backgroundColor: "#1a1a1a",
                color: "#00ff00",
                border: "1px solid #333",
                borderRadius: "3px",
                padding: "1px 4px",
                fontSize: "12px",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
              value={status.focusedFaction ?? ""}
              onChange={(e) => {
                const val = (e.target as HTMLSelectElement).value;
                restartRepDaemon(val || undefined);
              }}
            >
              <option value="">Auto ({status.targetFaction ?? "None"})</option>
              {(status.allFactions ?? []).map((f) => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Favor: </span>
            <span style={styles.statValue}>
              {(status.favor ?? 0).toFixed(0)}/{(status.favorToUnlock ?? 150).toFixed(0)}
            </span>
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
      </div>

      {/* Action Buttons */}
      {(status.hasUnlockedAugs || (status.pendingBackdoors && status.pendingBackdoors.length > 0) || showWorkButton || (status.pendingAugs ?? 0) > 0) && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          {showWorkButton && (
            <button
              style={{
                ...styles.buttonPlay,
                marginLeft: 0,
                padding: "4px 12px",
                backgroundColor: "#005500",
                color: "#00ff00",
              }}
              onClick={handleStartWork}
              title={`Start ${status.bestWorkType} work for ${status.targetFaction} with focus`}
            >
              Work: {status.bestWorkType}
            </button>
          )}
          {status.hasUnlockedAugs && (
            <button
              style={{
                ...styles.buttonPlay,
                marginLeft: 0,
                padding: "4px 12px",
              }}
              onClick={handleBuyAugs}
            >
              Buy Augs ({status.purchasePlan?.length ?? 0})
            </button>
          )}
          {status.pendingBackdoors && status.pendingBackdoors.length > 0 && (
            <button
              style={{
                ...styles.buttonPlay,
                marginLeft: 0,
                padding: "4px 12px",
                backgroundColor: "#004455",
                color: "#00ffff",
              }}
              onClick={handleBackdoors}
              title={status.pendingBackdoors.join(", ")}
            >
              Backdoors ({status.pendingBackdoors.length})
            </button>
          )}
          {(status.pendingAugs ?? 0) > 0 && (
              <button
                  style={{
                    ...styles.buttonPlay,
                    backgroundColor: confirmInstall ? "#aa0000" : "#550055",
                    color: confirmInstall ? "#fff" : "#ff88ff",
                    padding: "4px 12px",
                  }}
                  onClick={handleInstallAugs}
                  onBlur={handleInstallBlur}
              >
                {confirmInstall ? "Confirm Install?" : `Install Augs (${status.pendingAugs})`}
              </button>
          )}
        </div>
      )}

      {/* Next Unlock Section */}
      {status.nextAugName && (
        <div style={styles.card}>
          <div style={{ color: "#00ffff", fontSize: "12px", marginBottom: "8px" }}>
            NEXT UNLOCK: <span style={{ color: "#ffff00" }}>{status.nextAugName}</span>
          </div>

          {/* Progress Bar */}
          <ProgressBar
            progress={status.repProgress ?? 0}
            label={`${((status.repProgress ?? 0) * 100).toFixed(1)}%`}
            fillColor={(status.repProgress ?? 0) >= 1 ? "#00aa00" : "#0088aa"}
          />

          {/* Rep Stats */}
          <div style={styles.stat}>
            <span style={styles.statLabel}>Rep Progress</span>
            <span style={styles.statValue}>
              {status.currentRepFormatted} / {status.repRequiredFormatted}
            </span>
          </div>
          {status.repGapPositive && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Need</span>
              <span style={{ color: "#ffaa00" }}>{status.repGapFormatted} more</span>
            </div>
          )}

          {/* ETA and Cost */}
          <div style={{ ...styles.stat, marginTop: "8px" }}>
            <span style={styles.statLabel}>ETA</span>
            <span style={styles.etaDisplay}>
              {status.eta ?? "???"}
              {(status.repGainRate ?? 0) > 0 && (
                <span style={styles.dim}> @ {(status.repGainRate ?? 0).toFixed(1)}/s</span>
              )}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Cost</span>
            <span style={status.canAffordNextAug ? styles.statHighlight : { color: "#ff4444" }}>
              {status.canAffordNextAug ? "" : ""} ${status.nextAugCostFormatted}
            </span>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Pending Augs</span>
            <span style={styles.statHighlight}>{status.pendingAugs ?? 0}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Installed Augs</span>
            <span style={styles.statValue}>{status.installedAugs ?? 0}</span>
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Unlocked to Buy</span>
            <span style={styles.statHighlight}>{status.purchasePlan?.length ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Non-workable Factions Hint Box */}
      {status.nonWorkableFactions && status.nonWorkableFactions.length > 0 && (
        <div style={{
          ...styles.card,
          backgroundColor: "rgba(128, 0, 128, 0.15)",
          borderLeft: "3px solid #aa00aa",
        }}>
          <div style={{ color: "#cc88cc", fontSize: "11px", marginBottom: "6px" }}>
            PASSIVE PROGRESS (infiltration/special)
          </div>
          {status.nonWorkableFactions.map((item, i) => (
            <div key={i} style={{ marginBottom: i < status.nonWorkableFactions!.length - 1 ? "8px" : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span style={{ color: "#ffffff", fontSize: "11px" }}>{item.factionName}</span>
                <span style={{ color: "#888", fontSize: "10px" }}>
                  {item.currentRep} / {item.requiredRep}
                </span>
              </div>
              <div style={{
                height: "6px",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                borderRadius: "3px",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${item.progress * 100}%`,
                  backgroundColor: "#aa00aa",
                  borderRadius: "3px",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                <span style={{ color: "#888", fontSize: "10px" }}>
                  {item.nextAugName.substring(0, 32)}
                </span>
                <span style={{ color: "#cc88cc", fontSize: "10px" }}>
                  {(item.progress * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Purchase Order Table */}
      {status.purchasePlan && status.purchasePlan.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            PURCHASE ORDER
            <span style={{ ...styles.dim, marginLeft: "8px", fontWeight: "normal" }}>
              {status.purchasePlan.length} unlocked | ${totalCost.toLocaleString()} total
            </span>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.tableHeader, width: "24px" }}>#</th>
                <th style={styles.tableHeader}>Augmentation</th>
                <th style={styles.tableHeader}>Faction</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Adjusted</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseWithTotals.slice(0, 12).map((item, i) => {
                const rowStyle = i % 2 === 0 ? styles.tableRow : styles.tableRowAlt;

                return (
                  <tr key={i} style={rowStyle}>
                    <td style={{ ...styles.tableCell, color: "#888" }}>{i + 1}</td>
                    <td style={{ ...styles.tableCell, color: "#fff" }}>
                      {item.name.substring(0, 32)}
                    </td>
                    <td style={{ ...styles.tableCell, color: "#fff" }}>
                      {item.faction.substring(0, 16)}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right", color: "#00ff00" }}>
                      ${item.adjustedCostFormatted}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right", ...styles.runningTotal }}>
                      ${item.runningTotal.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {status.purchasePlan.length > 12 && (
                <tr style={styles.tableRowAlt}>
                  <td style={{ ...styles.tableCell, ...styles.dim }} colSpan={5}>
                    ... +{status.purchasePlan.length - 12} more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sequential Purchase Augs (Shadows of Anarchy, etc.) */}
      {status.sequentialAugs && status.sequentialAugs.length > 0 && (
        <div style={{
          ...styles.card,
          backgroundColor: "rgba(255, 170, 0, 0.1)",
          borderLeft: "3px solid #ffaa00",
          marginTop: "8px",
        }}>
          <div style={{ color: "#ffaa00", fontSize: "11px", marginBottom: "6px" }}>
            SEQUENTIAL ONLY (one at a time)
          </div>
          {status.sequentialAugs.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ color: "#fff", fontSize: "11px" }}>
                {item.augName.substring(0, 28)}
              </span>
              <span style={{ fontSize: "11px" }}>
                <span style={{ color: "#888" }}>{item.faction}</span>
                {" - "}
                <span style={{ color: item.canAfford ? "#00ff00" : "#ff4444" }}>
                  {item.canAfford ? "" : ""} ${item.costFormatted}
                </span>
              </span>
            </div>
          ))}
          <div style={{ color: "#888", fontSize: "10px", marginTop: "4px" }}>
            Rep requirement increases after each purchase
          </div>
        </div>
      )}

      {/* NeuroFlux Governor Section */}
      {status.neuroFlux && status.neuroFlux.bestFaction && (
        <div style={{
          ...styles.card,
          backgroundColor: "rgba(0, 150, 255, 0.1)",
          borderLeft: "3px solid #0088ff",
          marginTop: "8px",
        }}>
          <div style={{ color: "#0088ff", fontSize: "11px", marginBottom: "6px" }}>
            NEUROFLUX GOVERNOR
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Best Faction</span>
            <span style={styles.statValue}>{status.neuroFlux.bestFaction}</span>
          </div>

          {/* Rep progress when not enough rep */}
          {!status.neuroFlux.hasEnoughRep && (
            <>
              <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                <ProgressBar
                  progress={status.neuroFlux.repProgress}
                  label={`${(status.neuroFlux.repProgress * 100).toFixed(1)}%`}
                  fillColor="#0088ff"
                />
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Rep Progress</span>
                <span style={styles.statValue}>
                  {status.neuroFlux.currentRepFormatted} / {status.neuroFlux.repRequiredFormatted}
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Need</span>
                <span style={{ color: "#ffaa00" }}>{status.neuroFlux.repGapFormatted} more</span>
              </div>
              {(status.repGainRate ?? 0) > 0 && (
                <div style={styles.stat}>
                  <span style={styles.statLabel}>ETA</span>
                  <span style={styles.etaDisplay}>
                    {formatTime(status.neuroFlux.repGap / (status.repGainRate ?? 1))}
                    <span style={styles.dim}> @ {(status.repGainRate ?? 0).toFixed(1)}/s</span>
                  </span>
                </div>
              )}
            </>
          )}

          {/* Purchase info when can buy */}
          {status.neuroFlux.purchasePlan && (
            <>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Can Buy</span>
                <span style={styles.statHighlight}>
                  {status.neuroFlux.purchasePlan.purchases} upgrade{status.neuroFlux.purchasePlan.purchases !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Total Cost</span>
                <span style={{ color: "#00ff00" }}>
                  ${status.neuroFlux.purchasePlan.totalCostFormatted}
                </span>
              </div>
              <button
                style={{
                  ...styles.buttonPlay,
                  marginTop: "8px",
                  marginLeft: 0,
                  padding: "4px 12px",
                  backgroundColor: "#003366",
                  color: "#00aaff",
                }}
                onClick={handleBuyNFG}
              >
                Buy NFG ({status.neuroFlux.purchasePlan.purchases})
              </button>
            </>
          )}

          {/* Donate & Buy section when eligible */}
          {status.neuroFlux.canDonate && status.neuroFlux.donationPlan && (
            <div style={{
              marginTop: "12px",
              paddingTop: "8px",
              borderTop: "1px solid rgba(255, 200, 0, 0.3)",
            }}>
              <div style={{ color: "#ffcc00", fontSize: "11px", marginBottom: "6px" }}>
                DONATE & BUY (150+ favor)
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Can Buy</span>
                <span style={styles.statHighlight}>
                  {status.neuroFlux.donationPlan.purchases} upgrade{status.neuroFlux.donationPlan.purchases !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Donations</span>
                <span style={{ color: "#ffcc00" }}>
                  ${status.neuroFlux.donationPlan.totalDonationCostFormatted}
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Purchases</span>
                <span style={{ color: "#00ff00" }}>
                  ${status.neuroFlux.donationPlan.totalPurchaseCostFormatted}
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Total</span>
                <span style={{ color: "#00ffff" }}>
                  ${status.neuroFlux.donationPlan.totalCostFormatted}
                </span>
              </div>
              <button
                style={{
                  ...styles.buttonPlay,
                  marginTop: "8px",
                  marginLeft: 0,
                  padding: "4px 12px",
                  backgroundColor: "#554400",
                  color: "#ffcc00",
                }}
                onClick={handleDonateAndBuyNFG}
              >
                Donate & Buy ({status.neuroFlux.donationPlan.purchases})
              </button>
            </div>
          )}

          {/* Show next NFG cost when has rep but can't afford */}
          {status.neuroFlux.hasEnoughRep && !status.neuroFlux.purchasePlan && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Next Cost</span>
              <span style={{ color: "#ff4444" }}>${status.neuroFlux.currentPriceFormatted}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// === PLUGIN EXPORT ===

export const repPlugin: ToolPlugin<FormattedRepStatus> = {
  name: "REP",
  id: "rep",
  script: "daemons/rep.js",
  getFormattedStatus: formatRepStatus,
  OverviewCard: RepOverviewCard,
  DetailPanel: RepDetailPanel,
};
