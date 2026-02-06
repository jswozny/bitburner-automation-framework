/**
 * Nuke Tool Plugin
 *
 * Displays server rooting status with sortable table view.
 */
import React from "lib/react";
import { NS } from "@ns";
import { ToolPlugin, FormattedNukeStatus, OverviewCardProps, DetailPanelProps } from "views/dashboard/types";
import { styles } from "views/dashboard/styles";
import { ToolControl } from "views/dashboard/components/ToolControl";
import { getPluginUIState, setPluginUIState } from "views/dashboard/state-store";
import { getNukeStatus } from "/controllers/nuke";
import { getAllServers } from "lib/utils";

// === STATUS FORMATTING ===

function formatNukeStatus(ns: NS): FormattedNukeStatus {
  const raw = getNukeStatus(ns);
  const player = ns.getPlayer();
  const allServers = getAllServers(ns);

  const ready: FormattedNukeStatus["ready"] = [];
  const needHacking: FormattedNukeStatus["needHacking"] = [];
  const needPorts: FormattedNukeStatus["needPorts"] = [];
  const rooted: string[] = [];

  for (const hostname of allServers) {
    const server = ns.getServer(hostname);

    if (server.hasAdminRights) {
      rooted.push(hostname);
      continue;
    }

    const requiredPorts = server.numOpenPortsRequired ?? 0;
    const requiredHacking = server.requiredHackingSkill ?? 0;

    if (requiredHacking > player.skills.hacking) {
      needHacking.push({
        hostname,
        required: requiredHacking,
        current: player.skills.hacking,
      });
    } else if (requiredPorts > raw.toolCount) {
      needPorts.push({
        hostname,
        required: requiredPorts,
        current: raw.toolCount,
      });
    } else {
      ready.push({
        hostname,
        requiredHacking,
        requiredPorts,
      });
    }
  }

  // Sort by requirements
  ready.sort((a, b) => a.requiredHacking - b.requiredHacking);
  needHacking.sort((a, b) => a.required - b.required);
  needPorts.sort((a, b) => a.required - b.required);

  return {
    rootedCount: raw.rootedCount,
    totalServers: raw.totalServers,
    toolCount: raw.toolCount,
    ready,
    needHacking,
    needPorts,
    rooted,
  };
}

// === COMPONENTS ===

function NukeOverviewCard({ status, running, toolId, pid }: OverviewCardProps<FormattedNukeStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>NUKE</span>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>
      <div style={styles.stat}>
        <span style={styles.statLabel}>Rooted</span>
        <span style={styles.statHighlight}>
          {status ? `${status.rootedCount}/${status.totalServers}` : "—"}
        </span>
      </div>
      <div style={styles.stat}>
        <span style={styles.statLabel}>Tools</span>
        <span style={styles.statValue}>{status ? `${status.toolCount}/5` : "—"}</span>
      </div>
      <div style={styles.stat}>
        <span style={styles.statLabel}>Ready</span>
        <span style={status?.ready?.length ? styles.statHighlight : styles.statValue}>
          {status?.ready?.length ?? "—"}
        </span>
      </div>
    </div>
  );
}

function NukeDetailPanel({ status, running, toolId, pid }: DetailPanelProps<FormattedNukeStatus>): React.ReactElement {
  // Use module-level state instead of useState - persists across printRaw() calls
  const showRooted = getPluginUIState("nuke", "showRooted", false);

  const handleToggleRooted = () => {
    setPluginUIState("nuke", "showRooted", !showRooted);
  };

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>Tools: </span>
            <span style={styles.statHighlight}>{status ? `${status.toolCount}/5` : "—"}</span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Rooted: </span>
            <span style={styles.statHighlight}>
              {status ? `${status.rootedCount}/${status.totalServers}` : "—"}
            </span>
          </span>
        </div>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>

      {!status ? (
        <div style={styles.card}>
          <div style={{ color: "#888" }}>Waiting for status...</div>
        </div>
      ) : (
        <>

      {/* Server Table */}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.tableHeader}>Server</th>
            <th style={{ ...styles.tableHeader, textAlign: "center" }}>Hack Req</th>
            <th style={{ ...styles.tableHeader, textAlign: "center" }}>Ports</th>
            <th style={styles.tableHeader}>Status</th>
          </tr>
        </thead>
        <tbody>
          {/* Ready to nuke */}
          {status.ready.slice(0, 8).map((server, i) => (
            <tr key={`ready-${i}`} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <td style={{ ...styles.tableCell, color: "#fff" }}>{server.hostname}</td>
              <td style={{ ...styles.tableCell, textAlign: "center" }}>{server.requiredHacking}</td>
              <td style={{ ...styles.tableCell, textAlign: "center" }}>{server.requiredPorts}</td>
              <td style={{ ...styles.tableCell, ...styles.statusReady }}>Ready</td>
            </tr>
          ))}
          {status.ready.length > 8 && (
            <tr style={styles.tableRowAlt}>
              <td style={{ ...styles.tableCell, ...styles.dim }} colSpan={4}>
                ... +{status.ready.length - 8} more ready
              </td>
            </tr>
          )}

          {/* Need hacking level */}
          {status.needHacking.slice(0, 5).map((server, i) => (
            <tr
              key={`hack-${i}`}
              style={(status.ready.length + i) % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            >
              <td style={{ ...styles.tableCell, color: "#fff" }}>{server.hostname}</td>
              <td style={{ ...styles.tableCell, textAlign: "center", color: "#ffaa00" }}>
                {server.required}
              </td>
              <td style={{ ...styles.tableCell, textAlign: "center" }}>-</td>
              <td style={{ ...styles.tableCell, ...styles.statusNeedHack }}>
                Need hack {server.required}
              </td>
            </tr>
          ))}
          {status.needHacking.length > 5 && (
            <tr style={styles.tableRowAlt}>
              <td style={{ ...styles.tableCell, ...styles.dim }} colSpan={4}>
                ... +{status.needHacking.length - 5} more need hacking
              </td>
            </tr>
          )}

          {/* Need ports */}
          {status.needPorts.slice(0, 5).map((server, i) => (
            <tr
              key={`ports-${i}`}
              style={(status.ready.length + Math.min(5, status.needHacking.length) + i) % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            >
              <td style={{ ...styles.tableCell, color: "#fff" }}>{server.hostname}</td>
              <td style={{ ...styles.tableCell, textAlign: "center" }}>-</td>
              <td style={{ ...styles.tableCell, textAlign: "center", color: "#ff6600" }}>
                {server.required}
              </td>
              <td style={{ ...styles.tableCell, ...styles.statusNeedPorts }}>
                Need {server.required} port{server.required !== 1 ? "s" : ""}
              </td>
            </tr>
          ))}
          {status.needPorts.length > 5 && (
            <tr style={styles.tableRowAlt}>
              <td style={{ ...styles.tableCell, ...styles.dim }} colSpan={4}>
                ... +{status.needPorts.length - 5} more need ports
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Collapsible rooted section */}
      {status.rooted.length > 0 && (
        <div style={styles.section}>
          <div
            style={styles.collapsibleHeader}
            onClick={handleToggleRooted}
          >
            <span style={styles.collapseIcon}>{showRooted ? "▼" : "▶"}</span>
            <span>Rooted Servers ({status.rooted.length})</span>
          </div>
          {showRooted && (
            <ul style={styles.list}>
              {status.rooted.slice(0, 20).map((hostname, i) => (
                <li key={i} style={{ ...styles.listItem, ...styles.statusRooted }}>
                  ✓ {hostname}
                </li>
              ))}
              {status.rooted.length > 20 && (
                <li style={{ ...styles.listItem, ...styles.dim }}>
                  ... +{status.rooted.length - 20} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

// === PLUGIN EXPORT ===

export const nukePlugin: ToolPlugin<FormattedNukeStatus> = {
  name: "NUKE",
  id: "nuke",
  script: "daemons/nuke.js",
  getFormattedStatus: formatNukeStatus,
  OverviewCard: NukeOverviewCard,
  DetailPanel: NukeDetailPanel,
};
