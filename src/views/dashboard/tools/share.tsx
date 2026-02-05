/**
 * Share Tool Plugin
 *
 * Displays share power status and thread distribution.
 */
import React from "lib/react";
import { NS } from "@ns";
import { ToolPlugin, FormattedShareStatus, OverviewCardProps, DetailPanelProps } from "views/dashboard/types";
import { styles } from "views/dashboard/styles";
import { ToolControl } from "views/dashboard/components/ToolControl";
import { getShareStatus, DEFAULT_SHARE_SCRIPT } from "/controllers/share";

// === CYCLE TRACKING STATE (module-level) ===

const GRACE_PERIOD_MS = 2000; // 2 second grace period between share() cycles

let lastKnownThreads = 0;
let lastKnownThreadsFormatted = "0";
let lastSeenTime = 0;
let lastServerStats: { hostname: string; threads: string }[] = [];

// === STATUS FORMATTING ===

function formatShareStatus(ns: NS): FormattedShareStatus {
  const raw = getShareStatus(ns, DEFAULT_SHARE_SCRIPT);
  const now = Date.now();

  // Determine cycle status
  let cycleStatus: "active" | "cycle" | "idle";
  let displayThreads: string;
  let displayLastKnown: string;

  if (raw.totalThreads > 0) {
    // Active - update tracking
    lastKnownThreads = raw.totalThreads;
    lastKnownThreadsFormatted = raw.totalThreads.toLocaleString();
    lastSeenTime = now;
    lastServerStats = raw.serverStats.map(s => ({
      hostname: s.hostname,
      threads: s.threads.toLocaleString(),
    }));

    cycleStatus = "active";
    displayThreads = lastKnownThreadsFormatted;
    displayLastKnown = lastKnownThreadsFormatted;
  } else if (lastKnownThreads > 0 && (now - lastSeenTime) < GRACE_PERIOD_MS) {
    // Within grace period - show last known with cycle indicator
    cycleStatus = "cycle";
    displayThreads = lastKnownThreadsFormatted;
    displayLastKnown = lastKnownThreadsFormatted;
  } else {
    // Idle - no active threads and past grace period
    cycleStatus = "idle";
    displayThreads = "0";
    displayLastKnown = lastKnownThreads > 0 ? lastKnownThreadsFormatted : "0";
    // Reset tracking when truly idle for a while
    if (now - lastSeenTime > GRACE_PERIOD_MS * 2) {
      lastKnownThreads = 0;
      lastKnownThreadsFormatted = "0";
    }
  }

  // Use last known server stats during cycle, otherwise use current
  const serverStats = cycleStatus === "cycle" ? lastServerStats : raw.serverStats.map(s => ({
    hostname: s.hostname,
    threads: s.threads.toLocaleString(),
  }));

  return {
    totalThreads: displayThreads,
    sharePower: `${raw.sharePower.toFixed(3)}x`,
    shareRam: ns.formatRam(raw.shareRam),
    serversWithShare: cycleStatus === "cycle" ? lastServerStats.length : raw.serversWithShare,
    serverStats,
    cycleStatus,
    lastKnownThreads: displayLastKnown,
  };
}

// === COMPONENTS ===

function ShareOverviewCard({ status, running, toolId, pid }: OverviewCardProps<FormattedShareStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>SHARE</span>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>
      {status && (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Threads</span>
            <span style={styles.statHighlight}>
              {status.totalThreads}
              {status.cycleStatus === "cycle" && (
                <span style={{ color: "#ffaa00", marginLeft: "4px" }}>(cycle)</span>
              )}
            </span>
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

function ShareDetailPanel({ status, running, toolId, pid }: DetailPanelProps<FormattedShareStatus>): React.ReactElement {
  if (!status) {
    return <div style={styles.panel}>Loading share status...</div>;
  }

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>Threads: </span>
            <span style={styles.statHighlight}>
              {status.totalThreads}
              {status.cycleStatus === "cycle" && (
                <span style={{ color: "#ffaa00", marginLeft: "4px" }}>(cycle)</span>
              )}
            </span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Share Power: </span>
            <span style={styles.statHighlight}>{status.sharePower}</span>
          </span>
        </div>
        <ToolControl tool={toolId} running={running} pid={pid} />
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
  script: "daemons/share.js",
  getFormattedStatus: formatShareStatus,
  OverviewCard: ShareOverviewCard,
  DetailPanel: ShareDetailPanel,
};
