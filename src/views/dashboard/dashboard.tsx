/**
 * React Dashboard for Auto Tools
 *
 * Port-based dashboard: reads status from ports published by daemons.
 * Uses a two-tier grouped tab layout and data-driven plugin registry.
 */
import React from "lib/react";
import { NS } from "@ns";

const { useState, useEffect, useRef } = React;

// Types and state
import { DashboardState, ToolName } from "views/dashboard/types";
import { ToolPlugin } from "views/dashboard/types";
import {
  TabState,
  initCommandPort,
  readAndExecuteCommands,
  readStatusPorts,
  getActiveTab,
  setActiveTab,
  detectRunningTools,
  getStateSnapshot,
  loadDashboardSettings,
} from "views/dashboard/state-store";
// Styles and components
import { styles } from "views/dashboard/styles";
import { GroupedTabBar, TabGroup, ToolStatus } from "views/dashboard/components/TabBar";
import { ErrorBoundary } from "views/dashboard/components/ErrorBoundary";

// Tool plugins
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
import { augmentsPlugin } from "views/dashboard/tools/augments";
import { advisorPlugin } from "views/dashboard/tools/advisor";
import { contractsPlugin } from "views/dashboard/tools/contracts";

// === PLUGIN REGISTRY ===

/** Helper to pluck a field from DashboardState by key name. */
function pick<K extends keyof DashboardState>(key: K): (s: DashboardState) => DashboardState[K] {
  return (s: DashboardState) => s[key];
}

interface PluginEntry {
  toolId: ToolName;
  plugin: ToolPlugin<any>;
  tabLabel: string;
  getStatus: (s: DashboardState) => any;
  getError: (s: DashboardState) => string | null;
}

/** Flat registry of all plugins — used by OverviewPanel. */
const PLUGIN_REGISTRY: PluginEntry[] = [
  { toolId: "nuke",         plugin: nukePlugin,         tabLabel: "Nuke",       getStatus: pick("nukeStatus"),         getError: () => null },
  { toolId: "hack",         plugin: hackPlugin,         tabLabel: "Hack",       getStatus: pick("hackStatus"),         getError: () => null },
  { toolId: "pserv",        plugin: pservPlugin,        tabLabel: "PServ",      getStatus: pick("pservStatus"),        getError: () => null },
  { toolId: "darkweb",      plugin: darkwebPlugin,      tabLabel: "Darkweb",    getStatus: pick("darkwebStatus"),      getError: pick("darkwebError") as (s: DashboardState) => string | null },
  { toolId: "faction",      plugin: factionPlugin,      tabLabel: "Faction",    getStatus: pick("factionStatus"),      getError: pick("factionError") as (s: DashboardState) => string | null },
  { toolId: "rep",          plugin: repPlugin,          tabLabel: "Rep",        getStatus: pick("repStatus"),          getError: pick("repError") as (s: DashboardState) => string | null },
  { toolId: "share",        plugin: sharePlugin,        tabLabel: "Share",      getStatus: pick("shareStatus"),        getError: () => null },
  { toolId: "augments",     plugin: augmentsPlugin,     tabLabel: "Augs",       getStatus: pick("augmentsStatus"),     getError: () => null },
  { toolId: "work",         plugin: workPlugin,         tabLabel: "Work",       getStatus: pick("workStatus"),         getError: pick("workError") as (s: DashboardState) => string | null },
  { toolId: "gang",         plugin: gangPlugin,         tabLabel: "Gang",       getStatus: pick("gangStatus"),         getError: () => null },
  { toolId: "infiltration", plugin: infiltrationPlugin, tabLabel: "Infiltrate", getStatus: pick("infiltrationStatus"), getError: () => null },
  { toolId: "advisor",      plugin: advisorPlugin,      tabLabel: "Advisor",    getStatus: pick("advisorStatus"),       getError: () => null },
  { toolId: "contracts",    plugin: contractsPlugin,    tabLabel: "Contracts",  getStatus: pick("contractsStatus"),    getError: () => null },
];

/** Lookup a PluginEntry by toolId. */
function findEntry(toolId: ToolName): PluginEntry {
  return PLUGIN_REGISTRY.find(e => e.toolId === toolId)!;
}

/** Tab groups with references to their PluginEntries. */
interface TabGroupDef {
  label: string;
  entries: PluginEntry[];
}

const TAB_GROUPS: TabGroupDef[] = [
  { label: "Servers",        entries: [findEntry("nuke"), findEntry("hack"), findEntry("pserv"), findEntry("darkweb")] },
  { label: "Rep & Factions", entries: [findEntry("faction"), findEntry("rep"), findEntry("share"), findEntry("augments")] },
  { label: "Growth",         entries: [findEntry("work"), findEntry("gang")] },
  { label: "Tools",          entries: [findEntry("infiltration"), findEntry("contracts")] },
];

/** Build the TabGroup[] shape needed by GroupedTabBar. */
const TAB_GROUP_PROPS: TabGroup[] = TAB_GROUPS.map(g => ({
  label: g.label,
  subLabels: g.entries.map(e => e.tabLabel),
}));

// === OVERVIEW PANEL ===

/** Find the (group, sub) tab indices for a given toolId. */
function findTabForTool(toolId: ToolName): { group: number; sub: number } | null {
  for (let g = 0; g < TAB_GROUPS.length; g++) {
    for (let s = 0; s < TAB_GROUPS[g].entries.length; s++) {
      if (TAB_GROUPS[g].entries[s].toolId === toolId) return { group: g, sub: s };
    }
  }
  return null;
}

interface OverviewPanelProps {
  state: DashboardState;
  onNavigate: (toolId: ToolName) => void;
}

function OverviewPanel({ state, onNavigate }: OverviewPanelProps): React.ReactElement {
  const advisorEntry = findEntry("advisor");
  const AdvisorPanel = advisorEntry.plugin.DetailPanel;

  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <ErrorBoundary label="Advisor">
          <AdvisorPanel
              status={advisorEntry.getStatus(state)}
              running={state.pids[advisorEntry.toolId] > 0}
              toolId={advisorEntry.toolId}
              error={advisorEntry.getError(state)}
              pid={state.pids[advisorEntry.toolId]}
          />
        </ErrorBoundary>
      </div>
      <div style={styles.grid}>
        {PLUGIN_REGISTRY.filter(e => e.toolId !== "advisor").map(entry => {
          const Card = entry.plugin.OverviewCard;
          return (
            <div
              key={entry.toolId}
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate(entry.toolId)}
            >
              <ErrorBoundary label={entry.tabLabel}>
                <Card
                  status={entry.getStatus(state)}
                  running={state.pids[entry.toolId] > 0}
                  toolId={entry.toolId}
                  error={entry.getError(state)}
                  pid={state.pids[entry.toolId]}
                />
              </ErrorBoundary>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// === MAIN DASHBOARD ===

function Dashboard(): React.ReactElement {
  const [state, setState] = useState<DashboardState>(getStateSnapshot());
  const [tabState, setTabStateLocal] = useState<TabState>(getActiveTab());
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

  const handleOverviewClick = () => {
    const next: TabState = { group: -1, sub: 0 };
    setActiveTab(next);
    setTabStateLocal(next);
  };

  const handleGroupClick = (groupIndex: number) => {
    const next: TabState = { group: groupIndex, sub: 0 };
    setActiveTab(next);
    setTabStateLocal(next);
  };

  const handleSubClick = (subIndex: number) => {
    const next: TabState = { group: tabState.group, sub: subIndex };
    setActiveTab(next);
    setTabStateLocal(next);
  };

  const handleNavigate = (toolId: ToolName) => {
    const pos = findTabForTool(toolId);
    if (pos) {
      const next: TabState = { group: pos.group, sub: pos.sub };
      setActiveTab(next);
      setTabStateLocal(next);
    }
  };

  const renderPanel = () => {
    if (tabState.group === -1) {
      return <OverviewPanel state={state} onNavigate={handleNavigate} />;
    }

    const group = TAB_GROUPS[tabState.group];
    if (!group) return <div style={styles.panel}>Unknown group</div>;

    const entry = group.entries[tabState.sub];
    if (!entry) return <div style={styles.panel}>Unknown tab</div>;

    const Panel = entry.plugin.DetailPanel;
    return (
      <ErrorBoundary label={entry.tabLabel}>
        <Panel
          status={entry.getStatus(state)}
          running={state.pids[entry.toolId] > 0}
          toolId={entry.toolId}
          error={entry.getError(state)}
          pid={state.pids[entry.toolId]}
        />
      </ErrorBoundary>
    );
  };

  return (
    <div ref={rootRef} style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>AUTO TOOLS DASHBOARD</h1>
      </div>
      <GroupedTabBar
        groups={TAB_GROUP_PROPS}
        activeGroup={tabState.group}
        activeSub={tabState.sub}
        onOverviewClick={handleOverviewClick}
        onGroupClick={handleGroupClick}
        onSubClick={handleSubClick}
        statuses={TAB_GROUPS.map(g => g.entries.map((e): ToolStatus => {
          if (state.pids[e.toolId] > 0) return "running";
          if (e.toolId === "darkweb" && state.darkwebStatus?.allOwned) return "completed";
          return "stopped";
        }))}
      />
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
