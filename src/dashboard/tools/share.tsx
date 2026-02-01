/**
 * Share Tool Plugin
 *
 * Displays share power status and thread distribution.
 */
import React from "lib/react";
import { NS } from "@ns";
import { ToolPlugin, FormattedShareStatus, OverviewCardProps, DetailPanelProps } from "dashboard/types";
import { styles } from "dashboard/styles";
import { ToolControl } from "dashboard/components/ToolControl";
import { getShareStatus, DEFAULT_SHARE_SCRIPT } from "lib/share";

// === STATUS FORMATTING ===

function formatShareStatus(ns: NS): FormattedShareStatus {
  const raw = getShareStatus(ns, DEFAULT_SHARE_SCRIPT);

  return {
    totalThreads: raw.totalThreads.toLocaleString(),
    sharePower: `${raw.sharePower.toFixed(3)}x`,
    shareRam: ns.formatRam(raw.shareRam),
    serversWithShare: raw.serversWithShare,
    serverStats: raw.serverStats.map(s => ({
      hostname: s.hostname,
      threads: s.threads.toLocaleString(),
    })),
  };
}

// === COMPONENTS ===

function ShareOverviewCard({ status, running, toolId }: OverviewCardProps<FormattedShareStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>SHARE</span>
        <ToolControl tool={toolId} running={running} />
      </div>
      {status && (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Threads</span>
            <span style={styles.statHighlight}>{status.totalThreads}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Share Power</span>
            <span style={styles.statValue}>{status.sharePower}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Servers</span>
            <span style={styles.statValue}>{status.serversWithShare}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ShareDetailPanel({ status, running, toolId }: DetailPanelProps<FormattedShareStatus>): React.ReactElement {
  if (!status) {
    return <div style={styles.panel}>Loading share status...</div>;
  }

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>Threads: </span>
            <span style={styles.statHighlight}>{status.totalThreads}</span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Share Power: </span>
            <span style={styles.statHighlight}>{status.sharePower}</span>
          </span>
        </div>
        <ToolControl tool={toolId} running={running} />
      </div>

      <div style={styles.card}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Script RAM</span>
          <span style={styles.statValue}>{status.shareRam}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Servers with share</span>
          <span style={styles.statValue}>{status.serversWithShare}</span>
        </div>
      </div>

      {status.serverStats.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Top Servers by Threads</div>
          <ul style={styles.list}>
            {status.serverStats.slice(0, 10).map((s, i) => (
              <li key={i} style={styles.listItem}>
                <span style={{ color: "#fff" }}>{s.hostname.padEnd(20)}</span>
                <span style={styles.statHighlight}>{s.threads} threads</span>
              </li>
            ))}
            {status.serverStats.length > 10 && (
              <li style={{ ...styles.listItem, ...styles.dim }}>
                ... +{status.serverStats.length - 10} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// === PLUGIN EXPORT ===

export const sharePlugin: ToolPlugin<FormattedShareStatus> = {
  name: "SHARE",
  id: "share",
  script: "/auto/auto-share.js",
  getFormattedStatus: formatShareStatus,
  OverviewCard: ShareOverviewCard,
  DetailPanel: ShareDetailPanel,
};
