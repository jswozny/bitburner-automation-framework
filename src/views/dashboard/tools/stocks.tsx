/**
 * Stocks Tool Plugin
 *
 * OverviewCard shows P&L, position count, and mode.
 * DetailPanel shows positions table, signals, hack awareness overlay, and budget info.
 */
import React from "lib/react";
import { NS } from "@ns";
import {
  ToolPlugin,
  FormattedStocksStatus,
  OverviewCardProps,
  DetailPanelProps,
} from "views/dashboard/types";
import { StockPosition, StockSignal } from "/types/ports";
import { styles } from "views/dashboard/styles";
import { ToolControl } from "views/dashboard/components/ToolControl";
import { runScript } from "views/dashboard/state-store";

// === OVERVIEW CARD ===

function StocksOverviewCard({
  status,
  running,
  toolId,
  pid,
}: OverviewCardProps<FormattedStocksStatus>): React.ReactElement {
  const modeColors: Record<string, string> = {
    disabled: "#888",
    monitor: "#ffaa00",
    pre4s: "#00ff00",
    "4s": "#00ffff",
  };

  return (
    <div style={styles.cardOverview}>
      <div style={styles.cardTitle}>
        <span>STOCKS</span>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>
      {status ? (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Mode</span>
            <span style={{ color: modeColors[status.mode] || "#888" }}>
              {status.mode.toUpperCase()}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>P&L</span>
            <span style={{ color: status.totalProfit >= 0 ? "#00ff00" : "#ff4444" }}>
              {status.totalProfitFormatted}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Positions</span>
            <span style={styles.statValue}>
              {status.longPositions}L / {status.shortPositions}S
            </span>
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

function StocksDetailPanel({
  status,
  running,
  toolId,
  pid,
}: DetailPanelProps<FormattedStocksStatus>): React.ReactElement {
  if (!status) {
    return (
      <div style={styles.panel}>
        <div style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.statLabel}>Stocks</span>
          </div>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
        {!running ? (
          <>
            <div style={{ marginTop: "12px", color: "#ffaa00" }}>
              Stocks daemon not running.
            </div>
            <div style={{ ...styles.dim, marginTop: "8px", fontSize: "11px" }}>
              Click to start stock market monitoring and trading.
            </div>
          </>
        ) : (
          <div style={{ marginTop: "12px", color: "#ffaa00" }}>
            Waiting for first tick...
          </div>
        )}
      </div>
    );
  }

  const modeColors: Record<string, string> = {
    disabled: "#888",
    monitor: "#ffaa00",
    pre4s: "#00ff00",
    "4s": "#00ffff",
  };

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span style={styles.statLabel}>Stocks</span>
          <span style={styles.dim}>|</span>
          <span style={{ color: modeColors[status.mode] || "#888" }}>
            {status.mode.toUpperCase()}
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>P&L: </span>
            <span style={{ color: status.totalProfit >= 0 ? "#00ff00" : "#ff4444" }}>
              {status.totalProfitFormatted}
            </span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>$/s: </span>
            <span style={{ color: status.profitPerSec >= 0 ? "#00ff00" : "#ff4444" }}>
              {status.profitPerSecFormatted}
            </span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {status.positions.length > 0 && (
            <button
              style={{
                ...styles.buttonPlay,
                marginLeft: 0,
                padding: "2px 8px",
                backgroundColor: "#553300",
                color: "#ffaa00",
              }}
              onClick={() => runScript("stocks", "tools/control/sell-all-stocks.js")}
            >
              SELL ALL
            </button>
          )}
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
      </div>

      {/* API Status */}
      <div style={{ marginTop: "6px", display: "flex", gap: "12px", fontSize: "11px" }}>
        <span>
          WSE: <span style={{ color: status.hasWSE ? "#00ff00" : "#ff4444" }}>
            {status.hasWSE ? "YES" : "NO"}
          </span>
        </span>
        <span>
          TIX: <span style={{ color: status.hasTIX ? "#00ff00" : "#ff4444" }}>
            {status.hasTIX ? "YES" : "NO"}
          </span>
        </span>
        <span>
          4S: <span style={{ color: status.has4S ? "#00ff00" : "#ff4444" }}>
            {status.has4S ? "YES" : "NO"}
          </span>
        </span>
        <span style={styles.dim}>|</span>
        <span>
          Smart: <span style={{ color: status.smartMode ? "#00ff00" : "#888" }}>
            {status.smartMode ? "ON" : "OFF"}
          </span>
        </span>
        <span style={styles.dim}>|</span>
        <span>
          Capital: <span style={styles.statValue}>{status.tradingCapitalFormatted}</span>
        </span>
        <span style={styles.dim}>|</span>
        <span style={styles.dim}>Tick #{status.tickCount}</span>
      </div>

      {/* Portfolio Summary */}
      <div style={{ marginTop: "8px", display: "flex", gap: "16px" }}>
        <span>
          <span style={styles.statLabel}>Portfolio: </span>
          <span style={{ color: "#00ffff" }}>{status.portfolioValueFormatted}</span>
        </span>
        <span>
          <span style={styles.statLabel}>Realized: </span>
          <span style={{ color: status.realizedProfit >= 0 ? "#00ff00" : "#ff4444" }}>
            {status.realizedProfitFormatted}
          </span>
        </span>
        <span>
          <span style={styles.statLabel}>Pos: </span>
          <span>{status.longPositions}L / {status.shortPositions}S</span>
        </span>
      </div>

      {/* Positions Table */}
      {status.positions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>POSITIONS ({status.positions.length})</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Symbol</th>
                <th style={{ ...styles.tableHeader, width: "50px" }}>Dir</th>
                <th style={{ ...styles.tableHeader, width: "70px", textAlign: "right" }}>Shares</th>
                <th style={{ ...styles.tableHeader, width: "80px", textAlign: "right" }}>Avg</th>
                <th style={{ ...styles.tableHeader, width: "80px", textAlign: "right" }}>Price</th>
                <th style={{ ...styles.tableHeader, width: "90px", textAlign: "right" }}>P&L</th>
                <th style={{ ...styles.tableHeader, width: "50px", textAlign: "right" }}>Conf</th>
                <th style={{ ...styles.tableHeader, width: "60px" }}>Hack</th>
              </tr>
            </thead>
            <tbody>
              {status.positions.map((p: StockPosition, i: number) => {
                const rowStyle = i % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const dirColor = p.direction === "long" ? "#00ff00" : "#ff8800";
                const plColor = p.profit >= 0 ? "#00ff00" : "#ff4444";
                return (
                  <tr key={`${p.symbol}-${p.direction}`} style={rowStyle}>
                    <td style={{ ...styles.tableCell, color: "#0088ff" }}>{p.symbol}</td>
                    <td style={{ ...styles.tableCell, color: dirColor }}>
                      {p.direction.toUpperCase()}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>
                      {formatCompact(p.shares)}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>
                      {formatCompact(p.avgPrice)}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>
                      {formatCompact(p.currentPrice)}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right", color: plColor }}>
                      {p.profitFormatted}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>
                      {(p.confidence * 100).toFixed(0)}%
                    </td>
                    <td style={{
                      ...styles.tableCell,
                      color: p.hackAdjustment === "hacked" ? "#ff4444"
                           : p.hackAdjustment === "growing" ? "#00ff00"
                           : "#888",
                    }}>
                      {p.hackAdjustment || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Signals */}
      {status.signals.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>SIGNALS ({status.signals.length})</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Symbol</th>
                <th style={{ ...styles.tableHeader, width: "60px" }}>Direction</th>
                <th style={{ ...styles.tableHeader, width: "60px", textAlign: "right" }}>Strength</th>
                <th style={{ ...styles.tableHeader, width: "80px", textAlign: "right" }}>
                  {status.has4S ? "Forecast" : "MA Ratio"}
                </th>
              </tr>
            </thead>
            <tbody>
              {status.signals.map((s: StockSignal, i: number) => {
                const rowStyle = i % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const dirColor = s.direction === "long" ? "#00ff00"
                               : s.direction === "short" ? "#ff8800"
                               : "#888";
                return (
                  <tr key={s.symbol} style={rowStyle}>
                    <td style={{ ...styles.tableCell, color: "#0088ff" }}>{s.symbol}</td>
                    <td style={{ ...styles.tableCell, color: dirColor }}>
                      {s.direction.toUpperCase()}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>
                      {(s.strength * 100).toFixed(0)}%
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>
                      {s.forecast !== undefined ? s.forecast.toFixed(3)
                       : s.maRatio !== undefined ? s.maRatio.toFixed(4)
                       : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {status.positions.length === 0 && status.signals.length === 0 && status.hasTIX && (
        <div style={{ marginTop: "12px", color: "#888", textAlign: "center" }}>
          No positions or signals — building price history ({status.tickCount} ticks)
        </div>
      )}

      {/* No TIX state */}
      {!status.hasTIX && (
        <div style={{ marginTop: "12px", color: "#ffaa00", textAlign: "center" }}>
          Waiting for TIX API access (WSE: $200M, TIX: $5B)
        </div>
      )}
    </div>
  );
}

function formatCompact(n: number): string {
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

export const stocksPlugin: ToolPlugin<FormattedStocksStatus> = {
  name: "STOCKS",
  id: "stocks",
  script: "daemons/stocks.js",
  getFormattedStatus: noopStatus,
  OverviewCard: StocksOverviewCard,
  DetailPanel: StocksDetailPanel,
};
