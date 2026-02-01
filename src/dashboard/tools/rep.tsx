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
import { formatTime } from "lib/utils";

// === STATUS FORMATTING ===

function formatRepStatus(ns: NS, extra?: PluginContext): FormattedRepStatus | null {
  try {
    const player = ns.getPlayer();
    const raw = getRepStatus(ns, player);
    const target = raw.nextTarget;

    const repRequired = target?.aug?.repReq ?? 0;
    const currentRep = target?.faction?.currentRep ?? 0;
    const repGap = Math.max(0, repRequired - currentRep);
    const repProgress = repRequired > 0 ? Math.min(1, currentRep / repRequired) : 0;

    const repGainRate = extra?.repGainRate ?? 0;
    const favorToUnlock = extra?.favorToUnlock ?? 150;
    const playerMoney = extra?.playerMoney ?? player.money;

    // Calculate ETA
    let eta = "???";
    if (repGap > 0 && repGainRate > 0) {
      eta = formatTime(repGap / repGainRate);
    } else if (repGap <= 0) {
      eta = "Ready";
    }

    const nextAugCost = target?.aug?.basePrice ?? 0;

    return {
      targetFaction: target?.faction?.name ?? "None",
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
    };
  } catch {
    return null;
  }
}

// === COMPONENTS ===

function RepOverviewCard({ status, running, toolId, error }: OverviewCardProps<FormattedRepStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>REP</span>
        <ToolControl tool={toolId} running={running} error={!!error} />
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

function RepDetailPanel({ status, error, running, toolId }: DetailPanelProps<FormattedRepStatus>): React.ReactElement {
  if (error) {
    return (
      <div style={styles.panel}>
        <ToolControl tool={toolId} running={running} error={true} />
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
        <ToolControl tool={toolId} running={running} />
      </div>

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
