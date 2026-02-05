/**
 * Dashboard State Management
 *
 * Re-exports from state-store.ts for backwards compatibility.
 * The actual state is now managed in state-store.ts using module-level state.
 */

// Re-export everything from state-store
export {
  // Port-based command system
  initCommandPort,
  writeCommand,
  readAndExecuteCommands,
  // Port-based status reading
  readStatusPorts,
  // UI state
  getActiveTab,
  setActiveTab,
  getPluginUIState,
  setPluginUIState,
  // Tool state
  isToolRunning,
  getToolPid,
  setToolPid,
  detectRunningTools,
  syncPidState,
  getStateSnapshot,
} from "views/dashboard/state-store";
