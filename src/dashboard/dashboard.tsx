/**
 * React Dashboard for Auto Tools
 *
 * Provides a tabbed interface to monitor and control:
 * - auto-nuke: Server rooting
 * - auto-pserv: Purchased server management
 * - auto-share: Share power optimization
 * - auto-rep: Reputation grinding (requires Singularity)
 *
 * Modular architecture: add new tools by creating a plugin in tools/
 */
import React from "lib/react";
import { NS } from "@ns";

// Types and state
import {
  ToolName,
  DashboardState,
  DashboardCommand,
} from "dashboard/types";
import {
  currentActiveTab,
  setActiveTab,
  processPendingCommands,
  detectRunningTools,
  startTool,
  stopTool,
  COMMAND_PORT,
} from "dashboard/state";

// Styles and components
import { styles } from "dashboard/styles";
import { TabBar } from "dashboard/components/TabBar";

// Tool plugins
import { nukePlugin } from "dashboard/tools/nuke";
import { pservPlugin } from "dashboard/tools/pserv";
import { sharePlugin } from "dashboard/tools/share";
import { repPlugin } from "dashboard/tools/rep";
import { hackPlugin } from "dashboard/tools/hack";

const TAB_NAMES = ["Overview", "Hack", "Nuke", "Pserv", "Share", "Rep"];

// === OVERVIEW PANEL ===

interface OverviewPanelProps {
  state: DashboardState;
}

function OverviewPanel({ state }: OverviewPanelProps): React.ReactElement {
  const { pids, repError } = state;

  return (
    <div style={styles.panel}>
      <div style={styles.grid}>
        <hackPlugin.OverviewCard
            status={state.hackStatus}
            running={pids.hack > 0}
            toolId="hack"
        />
        <nukePlugin.OverviewCard
          status={state.nukeStatus}
          running={pids.nuke > 0}
          toolId="nuke"
        />
        <pservPlugin.OverviewCard
          status={state.pservStatus}
          running={pids.pserv > 0}
          toolId="pserv"
        />
        <sharePlugin.OverviewCard
          status={state.shareStatus}
          running={pids.share > 0}
          toolId="share"
        />
        <repPlugin.OverviewCard
          status={state.repStatus}
          running={pids.rep > 0}
          toolId="rep"
          error={repError}
        />
      </div>
    </div>
  );
}

// === MAIN DASHBOARD ===

interface DashboardProps {
  state: DashboardState;
}

function Dashboard({ state }: DashboardProps): React.ReactElement {
  const [, forceUpdate] = React.useState(0);

  const handleTabClick = (index: number) => {
    setActiveTab(index);
    forceUpdate(n => n + 1);
  };

  // Render the appropriate panel based on active tab
  const renderPanel = () => {
    switch (currentActiveTab) {
      case 0:
        return <OverviewPanel state={state} />;
      case 1:
        return (
            <hackPlugin.DetailPanel
                status={state.hackStatus}
                running={state.pids.hack > 0}
                toolId="hack"
            />
        );
      case 2:
        return (
          <nukePlugin.DetailPanel
            status={state.nukeStatus}
            running={state.pids.nuke > 0}
            toolId="nuke"
          />
        );
      case 3:
        return (
          <pservPlugin.DetailPanel
            status={state.pservStatus}
            running={state.pids.pserv > 0}
            toolId="pserv"
          />
        );
      case 4:
        return (
          <sharePlugin.DetailPanel
            status={state.shareStatus}
            running={state.pids.share > 0}
            toolId="share"
          />
        );
      case 5:
        return (
          <repPlugin.DetailPanel
            status={state.repStatus}
            running={state.pids.rep > 0}
            toolId="rep"
            error={state.repError}
          />
        );
      default:
        return <div style={styles.panel}>Unknown tab</div>;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>AUTO TOOLS DASHBOARD</h1>
      </div>
      <TabBar activeTab={currentActiveTab} tabs={TAB_NAMES} onTabClick={handleTabClick} />
      {renderPanel()}
    </div>
  );
}

// === MAIN LOOP ===

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(600, 500);

  const state: DashboardState = {
    pids: { nuke: 0, pserv: 0, share: 0, rep: 0, hack: 0 },
    nukeStatus: null,
    pservStatus: null,
    shareStatus: null,
    repStatus: null,
    repError: null,
    hackStatus: null,
  };

  // Get command port handle
  const cmdPort = ns.getPortHandle(COMMAND_PORT);

  // Rep gain rate tracking
  let lastRep = 0;
  let lastRepTime = Date.now();
  let repGainRate = 0;
  let lastTargetFaction = "";

  // Chunked sleep settings for responsive clicks
  const TICK_MS = 100;
  const TOTAL_MS = 1000;

  while (true) {
    // === 1. POLL COMMAND PORT ===
    while (!cmdPort.empty()) {
      try {
        const raw = cmdPort.read();
        if (typeof raw === "string") {
          const cmd = JSON.parse(raw) as DashboardCommand;
          processExternalCommand(ns, cmd, state);
        }
      } catch {
        // Ignore malformed commands
      }
    }

    // === 2. PROCESS UI COMMANDS (from React clicks) ===
    processPendingCommands(ns, state);

    // === 3. DETECT RUNNING TOOLS (finds scripts started manually or before restart) ===
    detectRunningTools(ns, state);

    // === 4. UPDATE STATUS (all NS calls happen here, before React) ===

    // Nuke status
    state.nukeStatus = nukePlugin.getFormattedStatus(ns);

    // Pserv status
    state.pservStatus = pservPlugin.getFormattedStatus(ns);

    // Share status
    state.shareStatus = sharePlugin.getFormattedStatus(ns);

    // Rep status - requires Singularity, with rep gain tracking
    try {
      const player = ns.getPlayer();
      const favorToUnlock = ns.getFavorToDonate();

      // Update rep gain rate if we have a previous measurement
      const repStatus = repPlugin.getFormattedStatus(ns, {
        playerMoney: player.money,
        repGainRate: 0,
        favorToUnlock,
      });

      if (repStatus && repStatus.targetFaction !== "None") {
        const currentRep = repStatus.currentRep;
        const now = Date.now();

        if (lastRep > 0 && lastTargetFaction === repStatus.targetFaction) {
          const timeDelta = (now - lastRepTime) / 1000;
          if (timeDelta > 0) {
            const repDelta = currentRep - lastRep;
            repGainRate = repGainRate * 0.7 + (repDelta / timeDelta) * 0.3;
          }
        }
        lastRep = currentRep;
        lastRepTime = now;
        lastTargetFaction = repStatus.targetFaction;
      }

      // Re-fetch with updated rep gain rate
      state.repStatus = repPlugin.getFormattedStatus(ns, {
        playerMoney: player.money,
        repGainRate,
        favorToUnlock,
      });
      state.repError = null;
    } catch {
      state.repStatus = null;
      state.repError = "Singularity API not available";
    }

    // Hack status
    state.hackStatus = hackPlugin.getFormattedStatus(ns);

    // === 5. RENDER (no NS calls inside React components) ===
    ns.clearLog();
    ns.printRaw(<Dashboard state={state} />);

    // === 6. CHUNKED SLEEP FOR RESPONSIVE CLICKS ===
    for (let elapsed = 0; elapsed < TOTAL_MS; elapsed += TICK_MS) {
      // Process pending commands immediately during sleep
      processPendingCommands(ns, state);
      await ns.sleep(TICK_MS);
    }
  }
}

// === EXTERNAL COMMAND PROCESSING ===

function processExternalCommand(ns: NS, cmd: DashboardCommand, state: DashboardState): void {
  if (cmd.type === "tab" && typeof cmd.tab === "number") {
    setActiveTab(cmd.tab);
  }

  if (cmd.type === "toggle" && cmd.tool && cmd.action) {
    const tools: ToolName[] = cmd.tool === "all"
      ? ["hack", "nuke", "pserv", "share", "rep"]
      : [cmd.tool as ToolName];

    for (const tool of tools) {
      if (cmd.action === "start") {
        startTool(ns, tool, state);
      } else if (cmd.action === "stop") {
        stopTool(ns, tool, state);
      }
    }
  }
}
