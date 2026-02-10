/**
 * Faction Manager Tool Plugin
 *
 * Displays faction discovery, joining, and travel status.
 * Supports tiered display based on daemon operating tier.
 */
import React from "lib/react";
import { NS } from "@ns";
import { ToolPlugin, FormattedFactionStatus, OverviewCardProps, DetailPanelProps } from "views/dashboard/types";
import { styles } from "views/dashboard/styles";
import { ToolControl } from "views/dashboard/components/ToolControl";
import {
  joinFactionCommand,
  restartFactionDaemon,
  getPluginUIState,
  setPluginUIState,
} from "views/dashboard/state-store";
import { peekStatus } from "lib/ports";
import { STATUS_PORTS, FactionStatus } from "types/ports";
import { CITY_FACTIONS, CITY_FACTION_CONFLICTS } from "/controllers/faction-manager";

const { useState } = React;

// === STATUS FORMATTING ===

function formatFactionStatus(ns: NS): FormattedFactionStatus | null {
  const portStatus = peekStatus<FactionStatus>(ns, STATUS_PORTS.faction);
  if (portStatus) return portStatus;
  return null;
}

// === TYPE BADGE COLORS ===

const TYPE_COLORS: Record<string, string> = {
  "city-exclusive": "#ffaa00",
  "location-locked": "#ff8800",
  "hacking": "#00ff00",
  "combat": "#ff4444",
  "endgame": "#aa00ff",
  "megacorp": "#0088ff",
  "special": "#888888",
};

// === HELPERS ===

function buildRequirementsTooltip(f: { name: string; requirements?: { label: string; met: boolean; verifiable: boolean }[]; eligible?: boolean }): string {
  if (!f.requirements || f.requirements.length === 0) return f.name;
  const lines = f.requirements.map(r => {
    const icon = !r.verifiable ? "[?]" : r.met ? "[+]" : "[-]";
    return `${icon} ${r.label}`;
  });
  const header = f.eligible === false ? `${f.name} (not eligible)` : f.name;
  return `${header}\n${lines.join("\n")}`;
}

// === COMPONENTS ===

function FactionOverviewCard({ status, running, toolId, error, pid }: OverviewCardProps<FormattedFactionStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>FACTION</span>
        <ToolControl tool={toolId} running={running} error={!!error} pid={pid} />
      </div>
      {error ? (
        <div style={{ color: "#ffaa00", fontSize: "11px" }}>{error}</div>
      ) : (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Joined</span>
            <span style={styles.statValue}>{status?.joinedCount ?? 0} / {(status?.factions?.length) ?? "?"}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Invited</span>
            <span style={{
              color: (status?.invitedCount ?? 0) > 0 ? "#ffff00" : "#888",
              fontWeight: (status?.invitedCount ?? 0) > 0 ? "bold" : "normal",
            }}>
              {status?.invitedCount ?? 0}
            </span>
          </div>
          {status?.preferredCityFaction && status.preferredCityFaction !== "None" && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>City</span>
              <span style={{ color: "#ffaa00", fontSize: "11px" }}>{status.preferredCityFaction}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FactionDetailPanel({ status, error, running, toolId, pid }: DetailPanelProps<FormattedFactionStatus>): React.ReactElement {
  const [showNotInvited, setShowNotInvited] = useState(false);

  if (error) {
    return (
      <div style={styles.panel}>
        <ToolControl tool={toolId} running={running} error={true} pid={pid} />
        <div style={{ color: "#ffaa00", marginTop: "12px" }}>{error}</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div style={styles.panel}>
        <div style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.statLabel}>Faction Manager</span>
          </div>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
        {!running ? (
          <>
            <div style={{ marginTop: "12px", color: "#ffaa00" }}>
              Faction daemon not running.
            </div>
            <div style={{ ...styles.dim, marginTop: "8px", fontSize: "11px" }}>
              Click to start the daemon. Status checks also come from the queue runner.
            </div>
          </>
        ) : (
          <div style={{ marginTop: "12px", color: "#ffaa00" }}>
            Waiting for status...
          </div>
        )}
      </div>
    );
  }

  const tier = status.tier;
  const invited = status.factions.filter(f => f.status === "invited");
  const joined = status.factions.filter(f => f.status === "joined");
  const notInvited = status.factions.filter(f => f.status === "not-invited");

  const preferredCity = getPluginUIState<string>("faction", "preferredCity", status.preferredCityFaction ?? "None");

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = (e.target as HTMLSelectElement).value;
    setPluginUIState("faction", "preferredCity", val);
    restartFactionDaemon(val === "None" ? undefined : val);
  };

  const handleJoin = (factionName: string) => {
    joinFactionCommand(factionName);
  };

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span style={styles.statLabel}>Faction Manager</span>
          <span style={{ color: "#888", fontSize: "11px", marginLeft: "8px" }}>
            Tier {tier}: {status.tierName}
          </span>
        </div>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>

      {/* Summary Stats */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Joined</span>
            <span style={styles.statHighlight}>{status.joinedCount}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Invited</span>
            <span style={{
              color: status.invitedCount > 0 ? "#ffff00" : "#888",
              fontWeight: status.invitedCount > 0 ? "bold" : "normal",
            }}>
              {status.invitedCount}
            </span>
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Remaining</span>
            <span style={styles.statValue}>{status.notInvitedCount}</span>
          </div>
          {status.playerCity && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>City</span>
              <span style={{ color: "#00ffff", fontSize: "11px" }}>{status.playerCity}</span>
            </div>
          )}
        </div>
      </div>

      {/* Preferred City Faction Dropdown */}
      <div style={{
        ...styles.card,
        backgroundColor: "rgba(255, 170, 0, 0.08)",
        borderLeft: "3px solid #ffaa00",
        marginTop: "8px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={styles.statLabel}>Preferred City Faction</span>
          <select
            style={{
              backgroundColor: "#1a1a1a",
              color: "#ffaa00",
              border: "1px solid #333",
              borderRadius: "3px",
              padding: "2px 6px",
              fontSize: "12px",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
            value={preferredCity}
            onChange={handleCityChange}
          >
            <option value="None">None</option>
            {Object.keys(CITY_FACTIONS).map(city => {
              const conflicts = CITY_FACTION_CONFLICTS[city] ?? [];
              const joinedConflict = conflicts.some(c => joined.some(f => f.name === c));
              const alreadyJoined = joined.some(f => f.name === city);
              const cityFaction = status.factions.find(f => f.name === city);
              const augLabel = tier >= 2 && cityFaction?.availableAugCount !== undefined
                ? ` (${cityFaction.availableAugCount} augs)`
                : "";
              return (
                <option key={city} value={city} disabled={joinedConflict}>
                  {city}{alreadyJoined ? " (joined)" : joinedConflict ? " (conflict)" : augLabel}
                </option>
              );
            })}
          </select>
        </div>
        {preferredCity !== "None" && (
          <div style={{ color: "#888", fontSize: "10px", marginTop: "4px" }}>
            City factions that conflict with {preferredCity} will be auto-skipped
          </div>
        )}
      </div>

      {/* Invited Factions */}
      {invited.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            PENDING INVITATIONS
            <span style={{ color: "#ffff00", marginLeft: "8px", fontWeight: "normal" }}>
              {invited.length}
            </span>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Faction</th>
                <th style={styles.tableHeader}>Type</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {invited.map((f, i) => {
                const isCityExclusive = f.type === "city-exclusive";
                return (
                  <tr key={f.name} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                    <td style={{ ...styles.tableCell, color: "#fff" }}>
                      {isCityExclusive && (
                        <span title="City-exclusive: joining blocks other city factions" style={{ color: "#ffaa00", marginRight: "4px" }}>!</span>
                      )}
                      {f.name}
                    </td>
                    <td style={{ ...styles.tableCell }}>
                      <span style={{
                        color: TYPE_COLORS[f.type] ?? "#888",
                        fontSize: "10px",
                      }}>
                        {f.type}
                      </span>
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right" }}>
                      <button
                        style={{
                          ...styles.buttonPlay,
                          marginLeft: 0,
                          padding: "2px 8px",
                          fontSize: "11px",
                        }}
                        onClick={() => handleJoin(f.name)}
                      >
                        Join
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Joined Factions */}
      {joined.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            JOINED FACTIONS
            <span style={{ ...styles.dim, marginLeft: "8px", fontWeight: "normal" }}>
              {joined.length}
            </span>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Faction</th>
                <th style={styles.tableHeader}>Type</th>
                {tier >= 2 && <th style={{ ...styles.tableHeader, textAlign: "right" }}>Augs</th>}
              </tr>
            </thead>
            <tbody>
              {joined.map((f, i) => (
                <tr key={f.name} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <td style={{ ...styles.tableCell, color: "#fff" }}>
                    {f.name.substring(0, 28)}
                  </td>
                  <td style={styles.tableCell}>
                    <span style={{
                      color: TYPE_COLORS[f.type] ?? "#888",
                      fontSize: "10px",
                    }}>
                      {f.type}
                    </span>
                  </td>
                  {tier >= 2 && (
                    <td style={{
                      ...styles.tableCell,
                      textAlign: "right",
                      color: f.hasAugsAvailable ? "#00ff00" : "#888",
                    }}>
                      {f.augCount !== undefined ? f.augCount : "?"}
                      {f.hasAugsAvailable === false && " (done)"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Auto-Management Status (Tier 3) */}
      {tier >= 3 && status.lastAction && (
        <div style={{
          ...styles.card,
          backgroundColor: "rgba(0, 255, 0, 0.08)",
          borderLeft: "3px solid #00aa00",
          marginTop: "8px",
        }}>
          <div style={{ color: "#00aa00", fontSize: "11px", marginBottom: "4px" }}>
            AUTO-MANAGEMENT
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Last Action</span>
            <span style={{ color: "#fff", fontSize: "11px" }}>{status.lastAction}</span>
          </div>
          {status.autoJoined && status.autoJoined.length > 0 && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Auto-Joined</span>
              <span style={{ color: "#00ff00", fontSize: "11px" }}>{status.autoJoined.join(", ")}</span>
            </div>
          )}
          {status.autoTraveled && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Traveled To</span>
              <span style={{ color: "#00ffff", fontSize: "11px" }}>{status.autoTraveled}</span>
            </div>
          )}
        </div>
      )}

      {/* Not Yet Invited (collapsible) */}
      {notInvited.length > 0 && (
        <div style={styles.section}>
          <div
            style={{ ...styles.sectionTitle, cursor: "pointer" }}
            onClick={() => setShowNotInvited(!showNotInvited)}
          >
            {showNotInvited ? "v" : ">"} NOT YET INVITED
            <span style={{ ...styles.dim, marginLeft: "8px", fontWeight: "normal" }}>
              {notInvited.length}
            </span>
          </div>
          {showNotInvited && (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeader}>Faction</th>
                  <th style={styles.tableHeader}>Type</th>
                  {tier >= 2 && <th style={{ ...styles.tableHeader, textAlign: "right" }}>Augs</th>}
                </tr>
              </thead>
              <tbody>
                {notInvited.map((f, i) => {
                  const ineligible = f.eligible === false;
                  const tooltip = buildRequirementsTooltip(f);
                  return (
                    <tr
                      key={f.name}
                      style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
                      title={tooltip}
                    >
                      <td style={{ ...styles.tableCell, color: ineligible ? "#555" : "#888" }}>
                        {f.name}
                        {ineligible && <span style={{ color: "#664400", fontSize: "10px", marginLeft: "4px" }}>(not eligible)</span>}
                      </td>
                      <td style={styles.tableCell}>
                        <span style={{
                          color: ineligible ? "#444" : (TYPE_COLORS[f.type] ?? "#888"),
                          fontSize: "10px",
                        }}>
                          {f.type}
                        </span>
                      </td>
                      {tier >= 2 && (
                        <td style={{
                          ...styles.tableCell,
                          textAlign: "right",
                          color: ineligible ? "#444" : "#888",
                        }}>
                          {f.availableAugCount !== undefined ? f.availableAugCount : "?"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// === PLUGIN EXPORT ===

export const factionPlugin: ToolPlugin<FormattedFactionStatus> = {
  name: "FACTION",
  id: "faction",
  script: "daemons/faction.js",
  getFormattedStatus: formatFactionStatus,
  OverviewCard: FactionOverviewCard,
  DetailPanel: FactionDetailPanel,
};
