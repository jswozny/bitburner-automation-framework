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
  // UI state
  getActiveTab,
  setActiveTab,
  getPluginUIState,
  setPluginUIState,
  // Plugin management
  shouldUpdatePlugin,
  markPluginUpdated,
  setCachedStatus,
  setRepError,
  // Tool state
  isToolRunning,
  getToolPid,
  setToolPid,
  detectRunningTools,
  syncPidState,
  getStateSnapshot,
} from "dashboard/state-store";
