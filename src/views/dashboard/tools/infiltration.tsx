/**
 * Infiltration Tool Plugin
 *
 * Dashboard OverviewCard and DetailPanel for the infiltration daemon.
 * Reads status from the infiltration status port.
 */
import React from "lib/react";
import { NS } from "@ns";
import { ToolPlugin, OverviewCardProps, DetailPanelProps } from "views/dashboard/types";
import { styles } from "views/dashboard/styles";
import { ToolControl } from "views/dashboard/components/ToolControl";
import { InfiltrationStatus } from "/types/ports";

// === STATUS FORMATTING ===

function formatInfiltrationStatus(_ns: NS): InfiltrationStatus | null {
  // Status comes from ports, not computed here
  return null;
}

// === HELPER COMPONENTS ===

function StateLabel({ state, paused }: { state: string; paused: boolean }): React.ReactElement {
  if (paused) {
    return <span style={{ color: "#ffaa00" }}>STOPPING</span>;
  }
  const colorMap: Record<string, string> = {
    IDLE: "#888",
    QUERYING: "#00ffff",
    NAVIGATING: "#00ffff",
    IN_GAME: "#00ff00",
    SOLVING: "#ffff00",
    REWARD_SELECT: "#00ff00",
    COMPLETING: "#00ff00",
    ERROR: "#ff4444",
    STOPPING: "#ffaa00",
  };
  return <span style={{ color: colorMap[state] || "#888" }}>{state}</span>;
}

function formatRate(n: number): string {
  return n > 0 ? `${(n * 100).toFixed(0)}%` : "—";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}b`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// === OVERVIEW CARD ===

function InfiltrationOverviewCard({ status, running, toolId, error, pid }: OverviewCardProps<InfiltrationStatus>): React.ReactElement {
  const primaryLine = (): string => {
    if (error) return "ERROR";
    if (!status || !running) return "Offline";
    if (status.state === "ERROR") return "ERROR";
    if (status.paused) return "Stopping...";
    if (status.state === "SOLVING" && status.currentTarget) {
      return `${status.currentTarget} (${status.currentGame ?? "?"}/${status.totalGames ?? "?"})`;
    }
    if (status.state === "IN_GAME" && status.currentTarget) {
      return `${status.currentTarget} (${status.currentGame ?? "?"}/${status.totalGames ?? "?"})`;
    }
    if (status.state === "NAVIGATING") return `Going to ${status.currentTarget ?? "..."}`;
    if (status.state === "IDLE") return "Idle";
    return status.state;
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>INFILTRATE</span>
        <ToolControl tool={toolId} running={running} error={!!error || status?.state === "ERROR"} pid={pid} />
      </div>
      {error ? (
        <div style={{ color: "#ffaa00", fontSize: "11px" }}>{error}</div>
      ) : (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Status</span>
            <span style={status?.state === "SOLVING" || status?.state === "IN_GAME" ? styles.statHighlight : styles.statValue}>
              {primaryLine()}
            </span>
          </div>
          {status && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Runs</span>
              <span style={styles.statValue}>
                {status.runsCompleted}/{status.runsCompleted + status.runsFailed}
                {status.successRate > 0 ? ` (${formatRate(status.successRate)})` : ""}
              </span>
            </div>
          )}
          {status?.expectedReward && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Reward</span>
              <span style={{ color: status.expectedReward.faction ? "#00ffff" : "#ffff00", fontSize: "11px" }}>
                {status.expectedReward.faction
                  ? `~${formatNumber(status.expectedReward.tradeRep)} rep (${status.expectedReward.faction})`
                  : `$${formatNumber(status.expectedReward.sellCash)}`}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// === DETAIL PANEL ===

function InfiltrationDetailPanel({ status, running, toolId, error, pid }: DetailPanelProps<InfiltrationStatus>): React.ReactElement {
  if (!status && !running) {
    return (
      <div style={styles.panel}>
        <div style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.statLabel}>Infiltration Daemon</span>
          </div>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
        <div style={styles.card}>
          <div style={{ color: "#888" }}>
            Daemon not running. Start it to begin automated infiltration.
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div style={styles.panel}>
        <div style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.statLabel}>Infiltration Daemon</span>
          </div>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
        <div style={styles.card}>
          <div style={{ color: "#ffaa00" }}>Waiting for status...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>State: </span>
            <StateLabel state={status.state} paused={status.paused} />
          </span>
          {status.currentTarget && (
            <>
              <span style={styles.dim}>|</span>
              <span>
                <span style={styles.statLabel}>Target: </span>
                <span style={styles.statValue}>{status.currentTarget}</span>
              </span>
            </>
          )}
          {status.currentGame !== undefined && (
            <>
              <span style={styles.dim}>|</span>
              <span>
                <span style={styles.statLabel}>Game: </span>
                <span style={styles.statValue}>{status.currentGame}/{status.totalGames ?? "?"}</span>
              </span>
            </>
          )}
        </div>
        <ToolControl tool={toolId} running={running} error={status.state === "ERROR"} pid={pid} />
      </div>

      {/* Error Display */}
      {status.error && (
        <div style={{ ...styles.card, borderColor: "#ff4444" }}>
          <div style={{ color: "#ff4444", fontSize: "12px", marginBottom: "4px" }}>ERROR</div>
          <div style={{ color: "#ffaa00", fontSize: "11px" }}>{status.error.message}</div>
          {status.error.solver && (
            <div style={{ color: "#888", fontSize: "10px", marginTop: "4px" }}>Solver: {status.error.solver}</div>
          )}
        </div>
      )}

      {/* Expected Reward */}
      {status.expectedReward && (
        <div style={styles.card}>
          <div style={{ color: "#00ffff", fontSize: "12px", marginBottom: "4px" }}>EXPECTED REWARD</div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>
              {status.expectedReward.faction ? "Faction Rep" : "Cash"}
            </span>
            <span style={{ color: status.expectedReward.faction ? "#00ffff" : "#ffff00" }}>
              {status.expectedReward.faction
                ? `${formatNumber(status.expectedReward.tradeRep)} (${status.expectedReward.faction})`
                : `$${formatNumber(status.expectedReward.sellCash)}`}
            </span>
          </div>
        </div>
      )}

      {/* Session Stats */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>SESSION STATS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          <div style={styles.card}>
            <div style={{ color: "#00ff00", fontSize: "16px", fontWeight: "bold" }}>{status.runsCompleted}</div>
            <div style={{ color: "#888", fontSize: "10px" }}>Completed</div>
          </div>
          <div style={styles.card}>
            <div style={{ color: "#ff4444", fontSize: "16px", fontWeight: "bold" }}>{status.runsFailed}</div>
            <div style={{ color: "#888", fontSize: "10px" }}>Failed</div>
          </div>
          <div style={styles.card}>
            <div style={{ color: "#ffff00", fontSize: "16px", fontWeight: "bold" }}>{formatRate(status.successRate)}</div>
            <div style={{ color: "#888", fontSize: "10px" }}>Success Rate</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Total Rep</span>
            <span style={{ color: "#00ffff" }}>{formatNumber(status.totalRepEarned)}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Total Cash</span>
            <span style={{ color: "#ffff00" }}>${formatNumber(status.totalCashEarned)}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Rep Runs</span>
            <span style={styles.statValue}>{status.rewardBreakdown.factionRep}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Cash Runs</span>
            <span style={styles.statValue}>{status.rewardBreakdown.money}</span>
          </div>
        </div>
      </div>

      {/* Solver Stats */}
      {Object.keys(status.solverStats).length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>SOLVER STATS</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Solver</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Attempts</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Success</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Avg Time</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(status.solverStats).map(([id, stats], i) => (
                <tr key={id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <td style={styles.tableCell}>{id}</td>
                  <td style={{ ...styles.tableCell, textAlign: "right" }}>{stats.attempts}</td>
                  <td style={{
                    ...styles.tableCell,
                    textAlign: "right",
                    color: stats.failures > 0 ? "#ffaa00" : "#00ff00",
                  }}>
                    {stats.attempts > 0 ? formatRate(stats.successes / stats.attempts) : "—"}
                  </td>
                  <td style={{ ...styles.tableCell, textAlign: "right", color: "#888" }}>
                    {stats.avgSolveTimeMs > 0 ? `${stats.avgSolveTimeMs.toFixed(0)}ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Company Stats */}
      {Object.keys(status.companyStats).length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>COMPANY STATS</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Company</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Attempts</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Success</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Fail</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(status.companyStats).map(([name, stats], i) => (
                <tr key={name} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <td style={styles.tableCell}>{name}</td>
                  <td style={{ ...styles.tableCell, textAlign: "right" }}>{stats.attempts}</td>
                  <td style={{ ...styles.tableCell, textAlign: "right", color: "#00ff00" }}>{stats.successes}</td>
                  <td style={{ ...styles.tableCell, textAlign: "right", color: stats.failures > 0 ? "#ff4444" : "#888" }}>{stats.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Available Locations */}
      {status.locations.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            LOCATIONS
            <span style={{ ...styles.dim, marginLeft: "8px", fontWeight: "normal" }}>
              {status.locations.length} available
            </span>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Company</th>
                <th style={styles.tableHeader}>City</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Diff</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Levels</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Rep</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Cash</th>
              </tr>
            </thead>
            <tbody>
              {status.locations
                .sort((a, b) => b.difficulty - a.difficulty)
                .map((loc, i) => (
                  <tr
                    key={loc.name}
                    style={{
                      ...(i % 2 === 0 ? styles.tableRow : styles.tableRowAlt),
                      ...(loc.name === status.config.targetCompanyOverride
                        ? { backgroundColor: "#002200" }
                        : {}),
                    }}
                  >
                    <td style={{ ...styles.tableCell, color: loc.name === status.currentTarget ? "#00ff00" : "#fff" }}>
                      {loc.name}
                    </td>
                    <td style={{ ...styles.tableCell, color: "#888" }}>{loc.city}</td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>{loc.difficulty.toFixed(1)}</td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>{loc.maxClearanceLevel}</td>
                    <td style={{ ...styles.tableCell, textAlign: "right", color: "#00ffff" }}>
                      {formatNumber(loc.reward.tradeRep)}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right", color: "#ffff00" }}>
                      ${formatNumber(loc.reward.sellCash)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Live Log */}
      {status.log.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            LOG
            <span style={{ ...styles.dim, marginLeft: "8px", fontWeight: "normal" }}>
              {status.log.length} entries
            </span>
          </div>
          <div style={{
            maxHeight: "200px",
            overflowY: "auto",
            backgroundColor: "#0a0a0a",
            border: "1px solid #222",
            borderRadius: "3px",
            padding: "4px",
            fontSize: "10px",
            fontFamily: "inherit",
          }}>
            {status.log.slice(-30).map((entry, i) => {
              const levelColor = entry.level === "error" ? "#ff4444"
                : entry.level === "warn" ? "#ffaa00"
                : "#888";
              return (
                <div key={i} style={{ padding: "1px 0", lineHeight: "1.4" }}>
                  <span style={{ color: "#555" }}>{timeAgo(entry.timestamp)}</span>
                  {" "}
                  <span style={{ color: levelColor }}>[{entry.level}]</span>
                  {" "}
                  <span style={{ color: "#ccc" }}>{entry.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Config Display */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>CONFIG</div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Target</span>
          <span style={styles.statValue}>{status.config.targetCompanyOverride || "Auto (highest difficulty)"}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Solvers</span>
          <span style={styles.statValue}>{status.config.enabledSolvers.length} enabled</span>
        </div>
      </div>
    </div>
  );
}

// === PLUGIN EXPORT ===

export const infiltrationPlugin: ToolPlugin<InfiltrationStatus> = {
  name: "INFILTRATE",
  id: "infiltration",
  script: "daemons/infiltration.js",
  getFormattedStatus: formatInfiltrationStatus,
  OverviewCard: InfiltrationOverviewCard,
  DetailPanel: InfiltrationDetailPanel,
};
