/**
 * React Dashboard for Auto Tools
 *
 * Provides a tabbed interface to monitor and control:
 * - hack/distributed: Distributed hacking
 * - auto-nuke: Server rooting
 * - auto-pserv: Purchased server management
 * - auto-share: Share power optimization
 * - auto-rep: Reputation grinding (requires Singularity)
 *
 */
import React from "lib/react";
import { NS } from "@ns";

const { useState, useEffect } = React;

// Types and state
import { DashboardState } from "dashboard/types";
import {
  initCommandPort,
  readAndExecuteCommands,
  getActiveTab,
  setActiveTab,
  detectRunningTools,
  getStateSnapshot,
  shouldUpdatePlugin,
  markPluginUpdated,
  setCachedStatus,
  setRepError,
} from "dashboard/state-store";

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

function Dashboard(): React.ReactElement {
  // React state - polls module-level state and triggers re-renders
  const [state, setState] = useState<DashboardState>(getStateSnapshot());
  const [activeTab, setActiveTabLocal] = useState<number>(getActiveTab());

  // Poll module-level state every 200ms
  useEffect(() => {
    const intervalId = setInterval(() => {
      setState(getStateSnapshot());
      setActiveTabLocal(getActiveTab());
    }, 200);

    // Cleanup on unmount (script termination)
    return () => clearInterval(intervalId);
  }, []);

  const handleTabClick = (index: number) => {
    setActiveTab(index);      // Persist to module state
    setActiveTabLocal(index); // Immediate UI feedback
  };

  // Render the appropriate panel based on active tab
  const renderPanel = () => {
    switch (activeTab) {
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
      <TabBar activeTab={activeTab} tabs={TAB_NAMES} onTabClick={handleTabClick} />
      {renderPanel()}
    </div>
  );
}

// === PLUGIN UPDATE LOGIC ===

// Rep gain rate tracking (module-level, persists across calls)
let lastRep = 0;
let lastRepTime = Date.now();
let repGainRate = 0;
let lastTargetFaction = "";

function updatePluginsIfNeeded(ns: NS): void {
  const now = Date.now();

  // Update nuke status
  if (shouldUpdatePlugin("nuke", now)) {
    setCachedStatus("nuke", nukePlugin.getFormattedStatus(ns));
    markPluginUpdated("nuke", now);
  }

  // Update pserv status
  if (shouldUpdatePlugin("pserv", now)) {
    setCachedStatus("pserv", pservPlugin.getFormattedStatus(ns));
    markPluginUpdated("pserv", now);
  }

  // Update share status
  if (shouldUpdatePlugin("share", now)) {
    setCachedStatus("share", sharePlugin.getFormattedStatus(ns));
    markPluginUpdated("share", now);
  }

  // Update hack status
  if (shouldUpdatePlugin("hack", now)) {
    setCachedStatus("hack", hackPlugin.getFormattedStatus(ns));
    markPluginUpdated("hack", now);
  }

  // Update rep status - requires Singularity, with rep gain tracking
  if (shouldUpdatePlugin("rep", now)) {
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
      const finalRepStatus = repPlugin.getFormattedStatus(ns, {
        playerMoney: player.money,
        repGainRate,
        favorToUnlock,
      });
      setCachedStatus("rep", finalRepStatus);
      setRepError(null);
    } catch {
      setCachedStatus("rep", null);
      setRepError("Singularity API not available");
    }
    markPluginUpdated("rep", now);
  }
}

// === MAIN LOOP ===

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(600, 700);

  // Initialize the command port for React→MainLoop communication
  initCommandPort(ns);
  ns.clearLog()
  ns.printRaw(<Dashboard />);

  while (true) {
    // 1. Process any pending commands first (responsive to clicks)
    readAndExecuteCommands(ns);

    // 2. Detect running tools (finds scripts started manually or before restart)
    detectRunningTools(ns);

    // 3. Update plugins with staggered intervals
    updatePluginsIfNeeded(ns);

    // 5. Short sleep with command polling for responsive UI
    // Faster total time (500ms) gives better visual feedback
    const TICK_MS = 100;
    const TOTAL_MS = 500;
    for (let elapsed = 0; elapsed < TOTAL_MS; elapsed += TICK_MS) {
      readAndExecuteCommands(ns);
      await ns.sleep(TICK_MS);
    }
  }
}
