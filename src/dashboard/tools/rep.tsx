/**
 * Rep Tool Plugin
 *
 * Displays reputation progress with ETA, progress bar, and running totals.
 */
import React from "lib/react";
import { NS } from "@ns";
import { ToolPlugin, FormattedRepStatus, OverviewCardProps, DetailPanelProps, PluginContext } from "dashboard/types";
import { styles } from "dashboard/styles";
import { ToolControl } from "dashboard/components/ToolControl";
import { ProgressBar } from "dashboard/components/ProgressBar";
import { getRepStatus } from "auto/auto-rep";
import { findNextWorkableAugmentation, getNonWorkableFactionProgress, getFactionWorkStatus } from "lib/factions";
import { formatTime } from "lib/utils";
import { runScript, startFactionWork } from "dashboard/state-store";

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
  try {
    const player = ns.getPlayer();
    const raw = getRepStatus(ns, player);

    // Use workable faction target instead of any faction
    const target = findNextWorkableAugmentation(raw.factionData);

    // Get non-workable faction progress
    const nonWorkableProgress = getNonWorkableFactionProgress(raw.factionData);

    const repRequired = target?.aug?.repReq ?? 0;
    const currentRep = target?.faction?.currentRep ?? 0;
    const repGap = Math.max(0, repRequired - currentRep);
    const repProgress = repRequired > 0 ? Math.min(1, currentRep / repRequired) : 0;

    const favorToUnlock = extra?.favorToUnlock ?? 150;
    const playerMoney = extra?.playerMoney ?? player.money;

    // Update rep gain rate tracking internally
    const now = Date.now();
    const targetFaction = target?.faction?.name ?? "None";

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
      favor: target?.faction?.favor ?? 0,
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
      // Work status
      isWorkingForFaction: workStatus.isWorkingForFaction,
      isOptimalWork: workStatus.isOptimalWork,
      bestWorkType: workStatus.bestWorkType,
      currentWorkType: workStatus.currentWorkType,
      isWorkable: workStatus.isWorkable,
    };
  } catch {
    return null;
  }
}

// === COMPONENTS ===

function RepOverviewCard({ status, running, toolId, error, pid }: OverviewCardProps<FormattedRepStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>REP</span>
        <ToolControl tool={toolId} running={running} error={!!error} pid={pid} />
      </div>
      {error ? (
        <div style={{ color: "#ffaa00", fontSize: "11px" }}>{error}</div>
      ) : status ? (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Target</span>
            <span style={styles.statHighlight}>{status.targetFaction}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Pending Augs</span>
            <span style={styles.statValue}>{status.pendingAugs}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Unlocked</span>
            <span style={styles.statValue}>{status.purchasePlan.length}</span>
          </div>
        </>
      ) : (
        <div style={styles.dim}>Loading...</div>
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
    return <div style={styles.panel}>Loading rep status...</div>;
  }

  // Calculate affordable count and total
  let runningTotal = 0;
  const purchaseWithTotals = status.purchasePlan.map(item => {
    runningTotal += item.adjustedCost;
    return { ...item, runningTotal };
  });
  const totalCost = runningTotal;

  const handleBuyAugs = () => {
    runScript("rep", "factions/rep-purchase.js", ["--confirm"]);
  };

  const handleBackdoors = () => {
    runScript("rep", "factions/faction-backdoors.js", []);
  };

  const handleStartWork = () => {
    if (status.targetFaction !== "None") {
      startFactionWork(status.targetFaction);
    }
  };

  // Show work button when: workable faction, not optimal work, and still need rep
  const showWorkButton = status.isWorkable && !status.isOptimalWork && status.repGapPositive;

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>Target: </span>
            <span style={styles.statHighlight}>{status.targetFaction}</span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Favor: </span>
            <span style={styles.statValue}>
              {status.favor.toFixed(0)}/{status.favorToUnlock.toFixed(0)}
            </span>
          </span>
        </div>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>

      {/* Action Buttons */}
      {(status.hasUnlockedAugs || status.pendingBackdoors.length > 0 || showWorkButton) && (
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
              Buy Augs ({status.purchasePlan.length})
            </button>
          )}
          {status.pendingBackdoors.length > 0 && (
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
            progress={status.repProgress}
            label={`${(status.repProgress * 100).toFixed(1)}%`}
            fillColor={status.repProgress >= 1 ? "#00aa00" : "#0088aa"}
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
              {status.eta}
              {status.repGainRate > 0 && (
                <span style={styles.dim}> @ {status.repGainRate.toFixed(1)}/s</span>
              )}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Cost</span>
            <span style={status.canAffordNextAug ? styles.statHighlight : { color: "#ff4444" }}>
              {status.canAffordNextAug ? "✓" : "✗"} ${status.nextAugCostFormatted}
            </span>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Pending Augs</span>
            <span style={styles.statHighlight}>{status.pendingAugs}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Installed Augs</span>
            <span style={styles.statValue}>{status.installedAugs}</span>
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Unlocked to Buy</span>
            <span style={styles.statHighlight}>{status.purchasePlan.length}</span>
          </div>
        </div>
      </div>

      {/* Non-workable Factions Hint Box */}
      {status.nonWorkableFactions.length > 0 && (
        <div style={{
          ...styles.card,
          backgroundColor: "rgba(128, 0, 128, 0.15)",
          borderLeft: "3px solid #aa00aa",
        }}>
          <div style={{ color: "#cc88cc", fontSize: "11px", marginBottom: "6px" }}>
            PASSIVE PROGRESS (infiltration/special)
          </div>
          {status.nonWorkableFactions.map((item, i) => (
            <div key={i} style={{ marginBottom: i < status.nonWorkableFactions.length - 1 ? "8px" : 0 }}>
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
      {status.purchasePlan.length > 0 && (
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
                // We'd need player money passed in to calculate affordability
                // For now, show all with styling
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
                  <td style={{ ...styles.tableCell, ...styles.dim }} colSpan={4}>
                    ... +{status.purchasePlan.length - 12} more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// === PLUGIN EXPORT ===

export const repPlugin: ToolPlugin<FormattedRepStatus> = {
  name: "REP",
  id: "rep",
  script: "/auto/auto-rep.js",
  getFormattedStatus: formatRepStatus,
  OverviewCard: RepOverviewCard,
  DetailPanel: RepDetailPanel,
};
