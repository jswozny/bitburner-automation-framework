/**
 * Budget Tool Plugin
 *
 * OverviewCard shows total cash, allocation breakdown by tier.
 * DetailPanel shows per-bucket allocations table.
 */
import React from "lib/react";
import { NS } from "@ns";
import {
  ToolPlugin,
  FormattedBudgetStatus,
  OverviewCardProps,
  DetailPanelProps,
} from "views/dashboard/types";
import { BucketAllocation } from "/types/ports";
import { styles } from "views/dashboard/styles";
import { ToolControl } from "views/dashboard/components/ToolControl";

// === OVERVIEW CARD ===

function BudgetOverviewCard({
  status,
  running,
  toolId,
  pid,
}: OverviewCardProps<FormattedBudgetStatus>): React.ReactElement {
  return (
    <div style={styles.cardOverview}>
      <div style={styles.cardTitle}>
        <span>BUDGET</span>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>
      {status ? (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Cash</span>
            <span style={{ color: "#00ff00" }}>{status.totalCashFormatted}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>T1/T2/T3</span>
            <span style={styles.statValue}>
              {Object.values(status.allocations).filter((a: BucketAllocation) => a.tier === 1).length}/
              {Object.values(status.allocations).filter((a: BucketAllocation) => a.tier === 2).length}/
              {Object.values(status.allocations).filter((a: BucketAllocation) => a.tier === 3).length}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Buckets</span>
            <span style={styles.statValue}>{Object.keys(status.allocations).length}</span>
          </div>
        </>
      ) : (
        <div style={styles.stat}>
          <span style={styles.statLabel}>Status</span>
          <span style={styles.dim}>{running ? "Starting..." : "Stopped"}</span>
        </div>
      )}
    </div>
  );
}

// === DETAIL PANEL ===

const tierColors: Record<number, string> = {
  1: "#ff4444",
  2: "#ffaa00",
  3: "#888",
};

function formatTier(tier: number): string {
  return tier === 1 ? "Critical" : tier === 2 ? "Growth" : "Optional";
}

function BudgetDetailPanel({
  status,
  running,
  toolId,
  pid,
}: DetailPanelProps<FormattedBudgetStatus>): React.ReactElement {
  if (!status) {
    return (
      <div style={styles.panel}>
        <div style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.statLabel}>Budget</span>
          </div>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
        {!running ? (
          <>
            <div style={{ marginTop: "12px", color: "#ffaa00" }}>
              Budget daemon not running.
            </div>
            <div style={{ ...styles.dim, marginTop: "8px", fontSize: "11px" }}>
              Consumers will assume unlimited budget (graceful fallback).
            </div>
          </>
        ) : (
          <div style={{ marginTop: "12px", color: "#ffaa00" }}>
            Waiting for first update...
          </div>
        )}
      </div>
    );
  }

  const allocations = Object.values(status.allocations) as BucketAllocation[];
  allocations.sort((a, b) => a.tier - b.tier || b.estimatedROI - a.estimatedROI);

  const tb = status.tierBreakdown;

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span style={styles.statLabel}>Budget</span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Cash: </span>
            <span style={{ color: "#00ff00" }}>{status.totalCashFormatted}</span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Reserve: </span>
            <span style={{ color: "#888" }}>{status.reserveFormatted}</span>
          </span>
        </div>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>

      {/* Tier Breakdown */}
      <div style={{ marginTop: "8px", display: "flex", gap: "16px" }}>
        <span>
          <span style={{ color: tierColors[1] }}>T1: </span>
          <span style={styles.statValue}>${formatNum(tb.tier1)}</span>
        </span>
        <span>
          <span style={{ color: tierColors[2] }}>T2: </span>
          <span style={styles.statValue}>${formatNum(tb.tier2)}</span>
        </span>
        <span>
          <span style={{ color: tierColors[3] }}>T3: </span>
          <span style={styles.statValue}>${formatNum(tb.tier3)}</span>
        </span>
      </div>

      {/* Allocations Table */}
      {allocations.length > 0 ? (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>ALLOCATIONS ({allocations.length})</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Bucket</th>
                <th style={{ ...styles.tableHeader, width: "60px" }}>Tier</th>
                <th style={{ ...styles.tableHeader, width: "100px", textAlign: "right" }}>Allocated</th>
                <th style={{ ...styles.tableHeader, width: "60px", textAlign: "right" }}>ROI</th>
                <th style={{ ...styles.tableHeader, width: "60px", textAlign: "right" }}>Pending</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a: BucketAllocation, i: number) => {
                const rowStyle = i % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                return (
                  <tr key={a.bucket} style={rowStyle}>
                    <td style={{ ...styles.tableCell, color: "#0088ff" }}>{a.bucket}</td>
                    <td style={{ ...styles.tableCell, color: tierColors[a.tier] || "#888" }}>
                      {formatTier(a.tier)}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right", color: a.allocated > 0 ? "#00ff00" : "#888" }}>
                      ${formatNum(a.allocated)}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>
                      {a.estimatedROI.toFixed(1)}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>
                      {a.pendingRequests}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ marginTop: "12px", color: "#00ff00", textAlign: "center" }}>
          No active budget requests
        </div>
      )}
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "t";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "b";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "m";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return n.toFixed(0);
}

// === PLUGIN EXPORT ===

function noopStatus(): null {
  return null;
}

export const budgetPlugin: ToolPlugin<FormattedBudgetStatus> = {
  name: "BUDGET",
  id: "budget",
  script: "daemons/budget.js",
  getFormattedStatus: noopStatus,
  OverviewCard: BudgetOverviewCard,
  DetailPanel: BudgetDetailPanel,
};
