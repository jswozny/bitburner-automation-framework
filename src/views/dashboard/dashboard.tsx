/**
 * React Dashboard for Auto Tools
 *
 * Port-based dashboard: reads status from ports published by daemons.
 * No longer calls getFormattedStatus() — data comes from peekStatus().
 * Panel components are still imported from dashboard/tools/ for display.
 *
 * Future: extract panel components to dashboard/panels/ without controller imports.
 */
import React from "lib/react";
import { NS } from "@ns";

const { useState, useEffect, useRef } = React;

// Types and state
import { DashboardState } from "views/dashboard/types";
import {
  initCommandPort,
  readAndExecuteCommands,
  readStatusPorts,
  getActiveTab,
  setActiveTab,
  detectRunningTools,
  getStateSnapshot,
  loadDashboardSettings,
} from "views/dashboard/state-store";
import { BitnodeStatusBar } from "views/dashboard/components/BitnodeStatus";

// Styles and components
import { styles } from "views/dashboard/styles";
import { TabBar } from "views/dashboard/components/TabBar";

// Tool plugins — imported for their React components only
// (getFormattedStatus is no longer called; data comes from ports)
import { nukePlugin } from "views/dashboard/tools/nuke";
import { pservPlugin } from "views/dashboard/tools/pserv";
import { sharePlugin } from "views/dashboard/tools/share";
import { repPlugin } from "views/dashboard/tools/rep";
import { hackPlugin } from "views/dashboard/tools/hack";
import { darkwebPlugin } from "views/dashboard/tools/darkweb";
import { workPlugin } from "views/dashboard/tools/work";
import { factionPlugin } from "views/dashboard/tools/faction";
import { infiltrationPlugin } from "views/dashboard/tools/infiltration";
import { gangPlugin } from "views/dashboard/tools/gang";

const TAB_NAMES = ["Overview", "Nuke", "Hack", "Pserv", "Share", "Faction", "Rep", "Work", "Darkweb", "Infiltrate", "Gang"];

// === OVERVIEW PANEL ===

interface OverviewPanelProps {
  state: DashboardState;
}

function OverviewPanel({ state }: OverviewPanelProps): React.ReactElement {
  const { pids, repError, darkwebError, workError } = state;

  return (
    <div style={styles.panel}>
      <div style={styles.grid}>
        <nukePlugin.OverviewCard
          status={state.nukeStatus}
          running={pids.nuke > 0}
          toolId="nuke"
          pid={pids.nuke}
        />
        <hackPlugin.OverviewCard
            status={state.hackStatus}
            running={pids.hack > 0}
            toolId="hack"
            pid={pids.hack}
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
        <factionPlugin.OverviewCard
          status={state.factionStatus}
          running={pids.faction > 0}
          toolId="faction"
          error={state.factionError}
          pid={pids.faction}
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
        <infiltrationPlugin.OverviewCard
          status={state.infiltrationStatus}
          running={pids.infiltration > 0}
          toolId="infiltration"
          pid={pids.infiltration}
        />
        <gangPlugin.OverviewCard
          status={state.gangStatus}
          running={pids.gang > 0}
          toolId="gang"
          pid={pids.gang}
        />
      </div>
    </div>
  );
}

// === MAIN DASHBOARD ===

function Dashboard(): React.ReactElement {
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
    }, 200);
    return () => clearInterval(intervalId);
  }, []);

  const handleTabClick = (index: number) => {
    setActiveTab(index);
    setActiveTabLocal(index);
  };

  const renderPanel = () => {
    switch (activeTab) {
      case 0:
        return <OverviewPanel state={state} />;
      case 1:
        return (
          <nukePlugin.DetailPanel
            status={state.nukeStatus}
            running={state.pids.nuke > 0}
            toolId="nuke"
            pid={state.pids.nuke}
          />
        );
      case 2:
        return (
            <hackPlugin.DetailPanel
                status={state.hackStatus}
                running={state.pids.hack > 0}
                toolId="hack"
                pid={state.pids.hack}
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
          <factionPlugin.DetailPanel
            status={state.factionStatus}
            running={state.pids.faction > 0}
            toolId="faction"
            error={state.factionError}
            pid={state.pids.faction}
          />
        );
      case 6:
        return (
          <repPlugin.DetailPanel
            status={state.repStatus}
            running={state.pids.rep > 0}
            toolId="rep"
            error={state.repError}
            pid={state.pids.rep}
          />
        );
      case 7:
        return (
          <workPlugin.DetailPanel
            status={state.workStatus}
            running={state.pids.work > 0}
            toolId="work"
            error={state.workError}
            pid={state.pids.work}
          />
        );
      case 8:
        return (
          <darkwebPlugin.DetailPanel
            status={state.darkwebStatus}
            running={state.pids.darkweb > 0}
            toolId="darkweb"
            error={state.darkwebError}
            pid={state.pids.darkweb}
          />
        );
      case 9:
        return (
          <infiltrationPlugin.DetailPanel
            status={state.infiltrationStatus}
            running={state.pids.infiltration > 0}
            toolId="infiltration"
            pid={state.pids.infiltration}
          />
        );
      case 10:
        return (
          <gangPlugin.DetailPanel
            status={state.gangStatus}
            running={state.pids.gang > 0}
            toolId="gang"
            pid={state.pids.gang}
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

// === MAIN LOOP ===

export async function main(ns: NS): Promise<void> {
  const PAUSED = false;
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(600, 700);

  // Initialize the command port for React→MainLoop communication
  initCommandPort(ns);
  loadDashboardSettings(ns);
  ns.clearLog()
  ns.printRaw(<Dashboard />);

  while (!PAUSED) {
    // 1. Process any pending commands first (responsive to clicks)
    readAndExecuteCommands(ns);

    // 2. Detect running tools (finds scripts started manually or before restart)
    detectRunningTools(ns);

    // 3. Read status from ports (published by daemons)
    readStatusPorts(ns);

    // 4. Short sleep with command polling for responsive UI
    const TICK_MS = 100;
    const TOTAL_MS = 500;
    for (let elapsed = 0; elapsed < TOTAL_MS; elapsed += TICK_MS) {
      readAndExecuteCommands(ns);
      await ns.sleep(TICK_MS);
    }
  }
}
