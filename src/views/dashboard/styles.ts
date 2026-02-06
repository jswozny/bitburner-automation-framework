/**
 * Dashboard Styles
 *
 * CSS-in-JS styles for the dashboard components.
 */
import React from "lib/react";

export const styles = {
  // === LAYOUT ===
  container: {
    fontFamily: "JetBrains Mono, Fira Code, monospace",
    backgroundColor: "#0a0a0a",
    color: "#00ff00",
    padding: "12px",
    minHeight: "400px",
    fontSize: "13px",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifySelf: "start",
  } as React.CSSProperties,

  header: {
    borderBottom: "1px solid #333",
    paddingBottom: "8px",
    marginBottom: "12px",
  } as React.CSSProperties,

  title: {
    color: "#00ffff",
    fontSize: "16px",
    fontWeight: "bold" as const,
    margin: 0,
  } as React.CSSProperties,

  // === TABS ===
  tabBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    marginBottom: "12px",
  } as React.CSSProperties,

  tab: {
    padding: "6px 12px",
    backgroundColor: "#1a1a1a",
    border: "1px solid #333",
    color: "#888",
    cursor: "pointer",
    fontSize: "12px",
  } as React.CSSProperties,

  tabActive: {
    padding: "6px 12px",
    backgroundColor: "#003300",
    border: "1px solid #00ff00",
    color: "#00ff00",
    cursor: "pointer",
    fontSize: "12px",
  } as React.CSSProperties,

  // === PANELS & CARDS ===
  panel: {
    backgroundColor: "#111",
    border: "1px solid #333",
    padding: "12px",
    borderRadius: "4px",
    flexGrow: 1,
    flexShrink: 1,
  } as React.CSSProperties,

  card: {
    backgroundColor: "#1a1a1a",
    border: "1px solid #333",
    padding: "10px",
    marginBottom: "8px",
    borderRadius: "4px",
  } as React.CSSProperties,

  cardTitle: {
    color: "#00ffff",
    fontSize: "14px",
    marginBottom: "6px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as React.CSSProperties,

  // === BADGES ===
  badge: {
    padding: "2px 8px",
    borderRadius: "3px",
    fontSize: "11px",
    fontWeight: "bold" as const,
  } as React.CSSProperties,

  badgeRunning: {
    backgroundColor: "#003300",
    color: "#00ff00",
    border: "1px solid #00ff00",
  } as React.CSSProperties,

  badgeStopped: {
    backgroundColor: "#330000",
    color: "#ff4444",
    border: "1px solid #ff4444",
  } as React.CSSProperties,

  badgeError: {
    backgroundColor: "#332200",
    color: "#ffaa00",
    border: "1px solid #ffaa00",
  } as React.CSSProperties,

  // === STATS ===
  stat: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "4px",
  } as React.CSSProperties,

  statLabel: {
    color: "#888",
  } as React.CSSProperties,

  statValue: {
    color: "#fff",
  } as React.CSSProperties,

  statHighlight: {
    color: "#00ff00",
  } as React.CSSProperties,

  dim: {
    color: "#666",
  } as React.CSSProperties,

  // === LAYOUT HELPERS ===
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
  } as React.CSSProperties,

  section: {
    marginTop: "12px",
  } as React.CSSProperties,

  sectionTitle: {
    color: "#00ffff",
    fontSize: "13px",
    marginBottom: "8px",
    borderBottom: "1px solid #333",
    paddingBottom: "4px",
  } as React.CSSProperties,

  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
  } as React.CSSProperties,

  listItem: {
    padding: "2px 0",
    color: "#ccc",
    fontSize: "12px",
  } as React.CSSProperties,

  // === BUTTONS ===
  buttonPlay: {
    marginLeft: "8px",
    padding: "2px 8px",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "bold" as const,
    backgroundColor: "#005500",
    color: "#00ff00",
  } as React.CSSProperties,

  buttonStop: {
    marginLeft: "8px",
    padding: "2px 8px",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "bold" as const,
    backgroundColor: "#550000",
    color: "#ff4444",
  } as React.CSSProperties,

  // === PROGRESS BAR ===
  progressContainer: {
    width: "100%",
    height: "16px",
    backgroundColor: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: "3px",
    overflow: "hidden",
    marginBottom: "4px",
  } as React.CSSProperties,

  progressFill: {
    height: "100%",
    backgroundColor: "#00aa00",
    transition: "width 0.3s ease",
  } as React.CSSProperties,

  progressText: {
    position: "absolute" as const,
    width: "100%",
    textAlign: "center" as const,
    color: "#fff",
    fontSize: "11px",
    lineHeight: "16px",
    textShadow: "0 0 2px #000",
  } as React.CSSProperties,

  // === TABLE ===
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "12px",
  } as React.CSSProperties,

  tableHeader: {
    backgroundColor: "#1a1a1a",
    borderBottom: "1px solid #444",
    color: "#00ffff",
    padding: "6px 8px",
    textAlign: "left" as const,
    fontWeight: "bold" as const,
  } as React.CSSProperties,

  tableCell: {
    padding: "4px 8px",
    borderBottom: "1px solid #222",
  } as React.CSSProperties,

  tableRow: {
    backgroundColor: "#0f0f0f",
  } as React.CSSProperties,

  tableRowAlt: {
    backgroundColor: "#141414",
  } as React.CSSProperties,

  // === PSERV 5x5 GRID ===
  serverGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 32px)",
    gap: "4px",
    justifyContent: "start",
    marginTop: "8px",
    marginBottom: "8px",
  } as React.CSSProperties,

  serverCell: {
    width: "32px",
    height: "32px",
    borderRadius: "2px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "default",
    fontSize: "10px",
    color: "#fff",
    textShadow: "0 0 2px #000",
    border: "1px solid #333",
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  } as React.CSSProperties,

  serverCellEmpty: {
    backgroundColor: "#1a1a1a",
    border: "1px dashed #333",
  } as React.CSSProperties,

  // === LEGEND ===
  legend: {
    display: "flex",
    gap: "12px",
    marginTop: "8px",
    fontSize: "11px",
    color: "#888",
  } as React.CSSProperties,

  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  } as React.CSSProperties,

  legendSwatch: {
    width: "12px",
    height: "12px",
    borderRadius: "2px",
    border: "1px solid #333",
  } as React.CSSProperties,

  // === ROW LAYOUTS ===
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  } as React.CSSProperties,

  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  } as React.CSSProperties,

  // === STATUS COLORS ===
  statusReady: {
    color: "#00ff00",
  } as React.CSSProperties,

  statusRooted: {
    color: "#00aa00",
  } as React.CSSProperties,

  statusNeedHack: {
    color: "#ffaa00",
  } as React.CSSProperties,

  statusNeedPorts: {
    color: "#ff6600",
  } as React.CSSProperties,

  // === REP-SPECIFIC ===
  repProgressWrapper: {
    position: "relative" as const,
    marginBottom: "8px",
  } as React.CSSProperties,

  etaDisplay: {
    color: "#00ffff",
    fontWeight: "bold" as const,
  } as React.CSSProperties,

  affordableRow: {
    color: "#00ff00",
  } as React.CSSProperties,

  unaffordableRow: {
    color: "#666",
  } as React.CSSProperties,

  runningTotal: {
    color: "#888",
    fontSize: "11px",
  } as React.CSSProperties,

  // === COLLAPSIBLE SECTION ===
  collapsibleHeader: {
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#00ffff",
    fontSize: "13px",
    marginBottom: "8px",
    paddingBottom: "4px",
    borderBottom: "1px solid #333",
  } as React.CSSProperties,

  collapseIcon: {
    fontSize: "10px",
    color: "#888",
  } as React.CSSProperties,

  // === HACK ACTION COLORS ===
  actionHack: {
    color: "#00ff00",
  } as React.CSSProperties,

  actionGrow: {
    color: "#ffff00",
  } as React.CSSProperties,

  actionWeaken: {
    color: "#0088ff",
  } as React.CSSProperties,
};

