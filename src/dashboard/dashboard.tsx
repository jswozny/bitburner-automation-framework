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

const { useState, useEffect, useRef } = React;

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
  setDarkwebError,
  setWorkError,
  setBitnodeStatus,
} from "dashboard/state-store";
import { BitnodeStatusBar, getBitnodeStatus } from "dashboard/components/BitnodeStatus";

// Styles and components
import { styles } from "dashboard/styles";
import { TabBar } from "dashboard/components/TabBar";

// Tool plugins
import { nukePlugin } from "dashboard/tools/nuke";
import { pservPlugin } from "dashboard/tools/pserv";
import { sharePlugin } from "dashboard/tools/share";
import { repPlugin } from "dashboard/tools/rep";
import { hackPlugin } from "dashboard/tools/hack";
import { darkwebPlugin } from "dashboard/tools/darkweb";
import { workPlugin } from "dashboard/tools/work";

const TAB_NAMES = ["Overview", "Hack", "Nuke", "Pserv", "Share", "Rep", "Work", "Darkweb"];

// === OVERVIEW PANEL ===

interface OverviewPanelProps {
  state: DashboardState;
}

function OverviewPanel({ state }: OverviewPanelProps): React.ReactElement {
  const { pids, repError, darkwebError, workError } = state;

  return (
    <div style={styles.panel}>
      <div style={styles.grid}>
        <hackPlugin.OverviewCard
            status={state.hackStatus}
            running={pids.hack > 0}
            toolId="hack"
            pid={pids.hack}
        />
        <nukePlugin.OverviewCard
          status={state.nukeStatus}
          running={pids.nuke > 0}
          toolId="nuke"
          pid={pids.nuke}
        />
        <pservPlugin.OverviewCard
          status={state.pservStatus}
          running={pids.pserv > 0}
          toolId="pserv"
          pid={pids.pserv}
        />
        <sharePlugin.OverviewCard
          status={state.shareStatus}
          running={pids.share > 0}
          toolId="share"
          pid={pids.share}
        />
        <repPlugin.OverviewCard
          status={state.repStatus}
          running={pids.rep > 0}
          toolId="rep"
          error={repError}
          pid={pids.rep}
        />
        <workPlugin.OverviewCard
          status={state.workStatus}
          running={pids.work > 0}
          toolId="work"
          error={workError}
          pid={pids.work}
        />
        <darkwebPlugin.OverviewCard
          status={state.darkwebStatus}
          running={pids.darkweb > 0}
          toolId="darkweb"
          error={darkwebError}
          pid={pids.darkweb}
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    let parent = rootRef.current.parentElement?.parentElement;
    if(parent) {
      parent.style.overflowY = 'auto';
      parent = parent.parentElement;
    }
    if (parent) {
      parent.style.justifyContent = 'start';
    }
  }, []);

  // Poll module-level state every 200ms
  useEffect(() => {
    const intervalId = setInterval(() => {
      setState(getStateSnapshot());
      //setActiveTabLocal(getActiveTab());
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
                pid={state.pids.hack}
            />
        );
      case 2:
        return (
          <nukePlugin.DetailPanel
            status={state.nukeStatus}
            running={state.pids.nuke > 0}
            toolId="nuke"
            pid={state.pids.nuke}
          />
        );
      case 3:
        return (
          <pservPlugin.DetailPanel
            status={state.pservStatus}
            running={state.pids.pserv > 0}
            toolId="pserv"
            pid={state.pids.pserv}
          />
        );
      case 4:
        return (
          <sharePlugin.DetailPanel
            status={state.shareStatus}
            running={state.pids.share > 0}
            toolId="share"
            pid={state.pids.share}
          />
        );
      case 5:
        return (
          <repPlugin.DetailPanel
            status={state.repStatus}
            running={state.pids.rep > 0}
            toolId="rep"
            error={state.repError}
            pid={state.pids.rep}
          />
        );
      case 6:
        return (
          <workPlugin.DetailPanel
            status={state.workStatus}
            running={state.pids.work > 0}
            toolId="work"
            error={state.workError}
            pid={state.pids.work}
          />
        );
      case 7:
        return (
          <darkwebPlugin.DetailPanel
            status={state.darkwebStatus}
            running={state.pids.darkweb > 0}
            toolId="darkweb"
            error={state.darkwebError}
            pid={state.pids.darkweb}
          />
        );
      default:
        return <div style={styles.panel}>Unknown tab</div>;
    }
  };

  return (
    <div ref={rootRef} style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>AUTO TOOLS DASHBOARD</h1>
      </div>
      <BitnodeStatusBar status={state.bitnodeStatus} />
      <TabBar activeTab={activeTab} tabs={TAB_NAMES} onTabClick={handleTabClick} />
      {renderPanel()}
    </div>
  );
}

// === PLUGIN UPDATE LOGIC ===

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

  // Update rep status - requires Singularity (rep gain tracking is now in rep.tsx)
  if (shouldUpdatePlugin("rep", now)) {
    try {
      const player = ns.getPlayer();
      const favorToUnlock = ns.getFavorToDonate();

      const repStatus = repPlugin.getFormattedStatus(ns, {
        playerMoney: player.money,
        favorToUnlock,
      });
      setCachedStatus("rep", repStatus);
      setRepError(null);

      // Also update bitnode status (same Singularity dependency, same interval)
      setBitnodeStatus(getBitnodeStatus(ns));
    } catch {
      setCachedStatus("rep", null);
      setRepError("Singularity API not available");
      setBitnodeStatus(null);
    }
    markPluginUpdated("rep", now);
  }

  // Update darkweb status - requires Singularity
  if (shouldUpdatePlugin("darkweb", now)) {
    try {
      const darkwebStatus = darkwebPlugin.getFormattedStatus(ns);
      setCachedStatus("darkweb", darkwebStatus);
      setDarkwebError(null);
    } catch {
      setCachedStatus("darkweb", null);
      setDarkwebError("Singularity API not available");
    }
    markPluginUpdated("darkweb", now);
  }

  // Update work status - requires Singularity
  if (shouldUpdatePlugin("work", now)) {
    try {
      const workStatus = workPlugin.getFormattedStatus(ns);
      setCachedStatus("work", workStatus);
      setWorkError(null);
    } catch {
      setCachedStatus("work", null);
      setWorkError("Singularity API not available");
    }
    markPluginUpdated("work", now);
  }

}

// === MAIN LOOP ===

export async function main(ns: NS): Promise<void> {
  const PAUSED = false;
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(600, 700);

  // Initialize the command port for React→MainLoop communication
  initCommandPort(ns);
  ns.clearLog()
  ns.printRaw(<Dashboard />);

  while (!PAUSED) {
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
