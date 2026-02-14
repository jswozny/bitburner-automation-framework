# Infiltration Daemon Spec

## Overview

A fully automated infiltration daemon that navigates the Bitburner UI, solves all six infiltration mini-games, and collects rewards. The daemon is triggered on-demand from the dashboard (not part of bootstrap), runs continuously until stopped, and publishes rich status data for dashboard display.

---

## Architecture

### State Machine

The daemon operates as an explicit state machine with these states:

| State | Description |
|---|---|
| `IDLE` | Daemon started, waiting for first run or between runs |
| `QUERYING` | Fetching infiltration data from NS API, selecting target |
| `NAVIGATING` | Navigating the game UI to the target company's infiltration screen |
| `IN_GAME` | Inside an infiltration, between mini-games (transition state) |
| `SOLVING` | Actively solving a detected mini-game |
| `REWARD_SELECT` | Infiltration complete, selecting reward |
| `COMPLETING` | Collecting reward, navigating back to safe state |
| `ERROR` | A solver failed or DOM elements not found; daemon halted |
| `STOPPING` | Stop requested; finishing current run then navigating to safe state |

**Pause/stop check**: Only occurs between full infiltration runs (at the `IDLE` state transition). Once an infiltration starts, it runs to completion (or error). When stopping, the daemon finishes its current infiltration, collects the reward, then navigates to the city view before exiting.

### File Layout

```
src/
  daemons/infiltration.ts        # Main daemon: state machine, lifecycle, status publishing
  lib/dom.ts                     # Shared DOM utilities (querySelector helpers, MutationObserver wrappers, click simulation, keyboard events)
  lib/infiltration/              # Infiltration-specific modules
    solvers/                     # One file per mini-game solver
      index.ts                   # Solver registry (detection + dispatch)
      slash.ts                   # Slash when guard looks away
      backward-string.ts         # Type the backward string
      brackets.ts                # Close the brackets
      minesweeper.ts             # Mine sweeper
      wire-cutting.ts            # Wire cutting
      remembering.ts             # Remembering game
    navigation.ts                # UI navigation helpers (go to city, go to company, start infiltration, select reward)
    types.ts                     # Infiltration-specific types (solver interface, state enum, config)
  views/dashboard/tools/infiltration.ts  # Dashboard plugin (OverviewCard + DetailPanel)
  types/ports.ts                 # Updated with InfiltrationStatus, ToolName, ports
```

### RAM Model

Fixed single tier. No tiered pattern. The daemon uses minimal NS API calls (`ns.infiltration.*` for data, `ns.ports` for status publishing) and relies on DOM manipulation for everything else. A single fixed RAM allocation is sufficient.

---

## Solver Plugin System

### Solver Interface

Each solver module exports an object conforming to:

```typescript
interface MiniGameSolver {
  /** Unique identifier for this solver */
  id: string;
  /** Human-readable name for dashboard display */
  name: string;
  /** Check if this mini-game is currently displayed in the DOM. Returns true if the solver recognizes the current screen. */
  detect(doc: Document): boolean;
  /** Read the current puzzle state from the DOM and solve it. Throws on failure. */
  solve(doc: Document, domUtils: DomUtils): Promise<void>;
}
```

### Solver Registry

`src/lib/infiltration/solvers/index.ts` exports:
- `SOLVERS: MiniGameSolver[]` — all registered solvers
- `detectAndSolve(doc, domUtils, enabledSolvers): Promise<string>` — iterates solvers, calls `detect()`, dispatches to the first match's `solve()`, returns the solver ID. Throws if no solver matches or if the matched solver fails.

The `enabledSolvers` parameter is a `Set<string>` of solver IDs, driven by the per-solver toggles in the dashboard config.

### Detection Strategy (Hybrid)

- **Primary**: MutationObserver on the game container to detect DOM changes signaling a new mini-game or state transition.
- **Fallback**: Polling at ~50ms intervals with a configurable timeout (default 5s) as a safety net against stuck states where MutationObserver misses a change.

### Initial Solvers (All Six)

1. **Slash** (`slash.ts`): Watch for guard facing direction via DOM/React state; simulate action when guard faces away.
2. **Backward String** (`backward-string.ts`): Read the displayed string from DOM, reverse it, type it via keyboard events.
3. **Brackets** (`brackets.ts`): Read the open brackets from DOM, generate closing sequence, type it.
4. **Minesweeper** (`minesweeper.ts`): Read grid state from DOM, apply minesweeper logic to identify safe cells, click them.
5. **Wire Cutting** (`wire-cutting.ts`): Read wire colors/hints from DOM, determine correct cut order, simulate clicks.
6. **Remembering** (`remembering.ts`): Observe the sequence shown, store it, replay via clicks/keyboard when prompted.

---

## DOM Utilities (`src/lib/dom.ts`)

Shared utilities for all current and future DOM-based automation:

```typescript
interface DomUtils {
  /** querySelector with type safety and error context */
  query<T extends Element>(selector: string, parent?: Element): T | null;
  /** querySelector that throws if not found */
  queryRequired<T extends Element>(selector: string, parent?: Element): T;
  /** Wait for an element matching selector to appear (MutationObserver + polling fallback) */
  waitForElement<T extends Element>(selector: string, timeoutMs?: number): Promise<T>;
  /** Wait for an element to disappear */
  waitForElementGone(selector: string, timeoutMs?: number): Promise<void>;
  /** Simulate a click on an element */
  click(el: Element): void;
  /** Simulate keyboard input */
  type(text: string): void;
  /** Simulate a single keypress */
  pressKey(key: string): void;
  /** Wait for a specified duration */
  sleep(ms: number): Promise<void>;
}
```

Navigation between UI screens uses a mix of NS API (where available), DOM clicks (for buttons), and keyboard events (for mini-game inputs).

---

## Target Selection & Reward Strategy

### Data Source

On startup and periodically (every 5 minutes or on demand), the daemon queries:
- `ns.infiltration.getPossibleLocations()` — list of infiltratable companies
- `ns.infiltration.getInfiltration(name)` — per-company details (difficulty, maxClearanceLevel, startingSecurityLevel, reward values)

This data is cached in the status port alongside other status fields.

### Target Selection

- **Default**: Pick the highest-difficulty company (since solvers should handle all games).
- **Override**: The dashboard config has a dropdown of known companies. If a company is selected, the daemon targets only that company.

### Reward Selection

Priority order:
1. **Faction rep**: Read `targetFaction` from the rep daemon's status port (`STATUS_PORTS.rep`). If a `targetFaction` is available and not stale, select "Trade for faction reputation" and choose that faction.
2. **Fallback to money**: If rep daemon status is unavailable, stale (older than configurable threshold, default 60s), or `targetFaction` is empty, select "Sell for money".

---

## Status Publishing

### InfiltrationStatus Interface

```typescript
interface InfiltrationStatus {
  // State
  state: InfiltrationState;  // Current state machine state
  paused: boolean;            // Whether a stop-after-current-run has been requested

  // Current run
  currentTarget?: string;     // Company name being infiltrated
  currentCity?: string;       // City of current target
  currentGame?: number;       // Mini-game index (1-based) within current infiltration
  totalGames?: number;        // Total mini-games for current infiltration
  currentSolver?: string;     // Name of the solver currently active
  expectedReward?: {          // Known from NS API data
    tradeRep: number;
    sellCash: number;
    faction?: string;         // Which faction rep would go to
  };

  // Session stats
  runsCompleted: number;
  runsFailed: number;
  successRate: number;         // runsCompleted / (runsCompleted + runsFailed)
  totalRepEarned: number;
  totalCashEarned: number;
  rewardBreakdown: {           // Count per reward type chosen
    factionRep: number;
    money: number;
  };

  // Per-company stats
  companyStats: Record<string, {
    attempts: number;
    successes: number;
    failures: number;
  }>;

  // Per-solver stats
  solverStats: Record<string, {
    attempts: number;
    successes: number;
    failures: number;
    avgSolveTimeMs: number;
  }>;

  // Config (reflected for dashboard display)
  config: {
    targetCompanyOverride?: string;
    enabledSolvers: string[];   // List of enabled solver IDs
  };

  // Live log (rolling buffer)
  log: InfiltrationLogEntry[];

  // Error info (when state === ERROR)
  error?: {
    message: string;
    solver?: string;
    timestamp: number;
  };

  // Cached infiltration data
  locations: Array<{
    name: string;
    city: string;
    difficulty: number;
    maxClearanceLevel: number;
    startingSecurityLevel: number;
    reward: {
      tradeRep: number;
      sellCash: number;
    };
  }>;
}

interface InfiltrationLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}
```

The log buffer holds the last 100 entries (configurable). Oldest entries are dropped when the buffer is full.

---

## Dashboard Integration

### Registration

Update the following in the codebase:
- `ToolName` union: add `'infiltration'`
- `TOOL_SCRIPTS`: add script path
- `STATUS_PORTS`: add port assignment
- `DashboardState`: add infiltration state field
- `CachedData`: add cached infiltration data
- `pluginUIState`: add UI state
- `DAEMON_DOCS` in `status.ts`: add documentation entry
- Tab ordering in `dashboard.tsx`: add infiltration tab

### Overview Card

Displays:
- **Primary line**: Current action — e.g., "Infiltrating MegaCorp (3/7)", "Idle", "Paused (finishing run)", "ERROR"
- **Secondary line**: Expected reward for current run — e.g., "~14.2k faction rep (Sector-12)" or "$1.2m"
- **Stats row**: Success rate, total runs completed, total rep/cash earned this session

### Detail Panel

Three sections:

#### 1. Configuration
- **Target company**: Dropdown populated from cached `locations` data. "Auto (highest difficulty)" as default option.
- **Enabled solvers**: Checkbox per registered solver (id + name). All enabled by default.
- **Start/Stop button**: Green "Start" when idle, "Stop After Run" when running (changes to orange with a spinner), "Force Stop" (red) that kills immediately.

#### 2. Statistics
- **Session summary**: Runs completed, failed, success rate, total rep earned, total cash earned, time running.
- **Per-solver table**: Solver name, attempts, success rate, avg solve time. Sortable.
- **Per-company table**: Company name, attempts, successes, failures. Sortable.

#### 3. Live Log
- Rolling buffer of log entries displayed as a scrollable list.
- Each entry shows timestamp (relative, e.g., "2s ago"), level (color-coded), and message.
- Auto-scrolls to bottom when new entries arrive.
- Max 100 entries visible.

---

## Start/Stop Lifecycle

### Starting
1. User clicks "Start" in the dashboard detail panel.
2. Dashboard writes a command to the command port: `{ type: 'start-infiltration' }`.
3. Main loop receives the command and calls `ns.run('daemons/infiltration.js')`.
4. Daemon starts, queries NS infiltration API, populates cache, publishes initial status, enters `IDLE` → `QUERYING` → `NAVIGATING` flow.

### Stopping (graceful)
1. User clicks "Stop After Run" in the dashboard.
2. Dashboard writes a command: `{ type: 'stop-infiltration' }`.
3. Main loop writes to the daemon's control port (a dedicated port for infiltration control messages).
4. Daemon reads the stop signal at the next `IDLE` check (between infiltration runs).
5. Daemon sets `state: STOPPING`, finishes current infiltration if mid-run, navigates to city view, publishes final status, then exits.

### Force Stop
1. User clicks "Force Stop".
2. Dashboard writes `{ type: 'kill-infiltration' }`.
3. Main loop calls `ns.kill()` on the daemon PID.
4. Since the daemon may be killed mid-infiltration, the player may be left on an infiltration screen (acceptable for force stop).

### Error Halt
1. A solver throws an error (DOM elements not found, unexpected state).
2. Daemon transitions to `ERROR` state.
3. Publishes error details in status.
4. Dashboard shows the error prominently (red indicator on overview card, error details in detail panel).
5. Daemon remains running in `ERROR` state (does not exit) so the user can see the error and manually intervene. User must stop and restart.

---

## Integration with Rep Daemon

The infiltration daemon reads the rep daemon's status from `STATUS_PORTS.rep`:
- Uses `peekStatus()` to read `RepStatus`.
- Reads `targetFaction` field to determine which faction to grind rep for.
- If the status is stale (timestamp older than 60s) or `targetFaction` is absent/empty, falls back to selling for money.
- Does **not** write to or modify the rep daemon's behavior in any way.

---

## Edge Cases & Error Handling

| Scenario | Behavior |
|---|---|
| No solver detects the current mini-game | Transition to `ERROR`; halt daemon; publish error with "unrecognized mini-game" message |
| Solver throws during `solve()` | Transition to `ERROR`; halt daemon; publish error with solver name and error message |
| DOM element not found (navigation) | Retry once after 1s; if still not found, transition to `ERROR` |
| Rep daemon not running | Fall back to selling for money |
| Infiltration API returns empty locations | Transition to `ERROR`; "no infiltratable locations found" |
| Company override set to a company not in locations list | Transition to `ERROR`; "configured company not found" |
| Player manually interacts with UI mid-infiltration | Undefined behavior; not guarded against (no safeguards per spec) |
| Game update changes DOM structure | Solver `detect()` or `solve()` will fail → `ERROR` state halt |

---

## Future Considerations (Out of Scope for v1)

- Smart reward targeting based on augmentation proximity thresholds
- Persistent stats across daemon restarts (file-based)
- Auto-calibrating difficulty selection based on success rate
- Additional mini-game solvers if new games are added to Bitburner
- Overlay/toast showing automation progress without opening dashboard
