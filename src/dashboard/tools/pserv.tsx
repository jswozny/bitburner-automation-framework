/**
 * Pserv Tool Plugin
 *
 * Displays purchased server status with 5x5 visual grid.
 */
import React from "lib/react";
import { NS } from "@ns";
import { ToolPlugin, FormattedPservStatus, OverviewCardProps, DetailPanelProps } from "dashboard/types";
import { styles } from "dashboard/styles";
import { ToolControl } from "dashboard/components/ToolControl";
import { getPservStatus } from "lib/pserv";

// === STATUS FORMATTING ===

function formatPservStatus(ns: NS): FormattedPservStatus {
  const raw = getPservStatus(ns);

  return {
    serverCount: raw.serverCount,
    serverCap: raw.serverCap,
    totalRam: ns.formatRam(raw.totalRam),
    minRam: ns.formatRam(raw.minRam),
    maxRam: ns.formatRam(raw.maxRam),
    maxPossibleRam: ns.formatRam(raw.maxPossibleRam),
    allMaxed: raw.allMaxed,
    maxPossibleRamNum: raw.maxPossibleRam,
    servers: raw.servers.map(hostname => {
      const ram = ns.getServerMaxRam(hostname);
      return {
        hostname,
        ram,
        ramFormatted: ns.formatRam(ram),
      };
    }),
  };
}

// === COMPONENTS ===

function PservOverviewCard({ status, running, toolId }: OverviewCardProps<FormattedPservStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>PSERV</span>
        <ToolControl tool={toolId} running={running} />
      </div>
      {status && (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Servers</span>
            <span style={styles.statHighlight}>
              {status.serverCount}/{status.serverCap}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Total RAM</span>
            <span style={styles.statValue}>{status.totalRam}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Status</span>
            <span style={status.allMaxed ? styles.statHighlight : styles.statValue}>
              {status.allMaxed ? "MAXED" : `${status.minRam} - ${status.maxRam}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

interface ServerCellProps {
  server: { hostname: string; ram: number; ramFormatted: string } | null;
  maxRam: number;
  index: number;
}

function ServerCell({ server, maxRam, index }: ServerCellProps): React.ReactElement {
  if (!server) {
    return (
      <div
        style={{ ...styles.serverCell, ...styles.serverCellEmpty }}
        title={`Slot ${index + 1}: Empty`}
      >
        <span style={styles.dim}>-</span>
      </div>
    );
  }

  // Calculate fill percentage using log scale
  const fillPercent = Math.round((Math.log2(server.ram) / Math.log2(maxRam)) * 100);
  const isMaxed = server.ram >= maxRam;

  return (
    <div
      style={styles.serverCell}
      title={`${server.hostname}: ${server.ramFormatted}`}
    >
      {/* Fill bar from bottom */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: `${fillPercent}%`,
        backgroundColor: isMaxed ? "#00aa00" : "#006600",
      }} />
      {/* Star on top for maxed servers */}
      {isMaxed && <span style={{ position: "relative", zIndex: 1 }}>★</span>}
    </div>
  );
}

function PservDetailPanel({ status, running, toolId }: DetailPanelProps<FormattedPservStatus>): React.ReactElement {
  if (!status) {
    return <div style={styles.panel}>Loading pserv status...</div>;
  }

  // Create 25 slots (5x5 grid)
  const slots: (FormattedPservStatus["servers"][0] | null)[] = [];
  for (let i = 0; i < 25; i++) {
    slots.push(status.servers[i] ?? null);
  }

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>Servers: </span>
            <span style={styles.statHighlight}>
              {status.serverCount}/{status.serverCap}
            </span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Total RAM: </span>
            <span style={styles.statHighlight}>{status.totalRam}</span>
          </span>
        </div>
        <ToolControl tool={toolId} running={running} />
      </div>

      {/* 5x5 Server Grid */}
      <div style={styles.serverGrid}>
        {slots.map((server, i) => (
          <ServerCell
            key={i}
            server={server}
            maxRam={status.maxPossibleRamNum}
            index={i}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendSwatch, backgroundColor: "#1a1a1a" }} />
          <span>Empty</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{
            ...styles.legendSwatch,
            background: "linear-gradient(to top, #006600 50%, #1a1a1a 50%)"
          }} />
          <span>Partial</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendSwatch, backgroundColor: "#00aa00" }} />
          <span>Max ★</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ ...styles.grid, marginTop: "12px" }}>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Min RAM</span>
            <span style={styles.statValue}>{status.minRam}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Max RAM</span>
            <span style={styles.statValue}>{status.maxRam}</span>
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Max Possible</span>
            <span style={styles.statValue}>{status.maxPossibleRam}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Status</span>
            <span style={status.allMaxed ? styles.statHighlight : styles.statValue}>
              {status.allMaxed ? "ALL MAXED" : "Upgrading..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// === PLUGIN EXPORT ===

export const pservPlugin: ToolPlugin<FormattedPservStatus> = {
  name: "PSERV",
  id: "pserv",
  script: "/auto/auto-pserv.js",
  getFormattedStatus: formatPservStatus,
  OverviewCard: PservOverviewCard,
  DetailPanel: PservDetailPanel,
};
