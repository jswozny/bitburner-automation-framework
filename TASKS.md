# Implementation Tasks

Ordered by dependency. Later phases depend on earlier ones.
Each task is scoped to be completable in a single session.

---

## Phase 1: Foundation

These create the infrastructure that all other phases depend on.

### Task 1.1: Create `lib/config.ts` Config Reader/Writer
**Files**: New `src/lib/config.ts`
**Description**: Implement the config system described in the spec. Functions:
- `readConfig(ns, system)` — Read `/config/{system}.txt`, return key-value map
- `writeDefaultConfig(ns, system, defaults)` — Create file with defaults if it doesn't exist
- `getConfigNumber/Bool/String()` — Typed accessors with fallbacks
- Use only `ns.read()` and `ns.write()` (minimal RAM cost)
**Acceptance**: Can read/write config files in-game. Handles missing files, comments, blank lines.
**Effort**: Small

### Task 1.2: Deduplicate RAM Kill-Tier Logic
**Files**: `src/lib/launcher.ts`, `src/lib/ram-utils.ts`, `src/daemons/queue.ts`
**Description**: Consolidate three implementations of "walk kill tiers and free RAM" into
one canonical implementation in `lib/ram-utils.ts`. Update `launcher.ts` and `queue.ts` to
import from `ram-utils.ts`.
**Acceptance**: Only one implementation exists. All three callers use it. No behavior change.
**Effort**: Small

### Task 1.3: Create `lib/server-cache.ts` with TTL Caching
**Files**: New `src/lib/server-cache.ts`, update all `getAllServers()` callers
**Description**: Wrap `getAllServers()` with a TTL cache (default 10s). Provide
`invalidateServerCache()` for the nuke daemon to call after rooting new servers.
**Acceptance**: BFS only runs once per TTL period. Nuke daemon invalidates on root events.
**Effort**: Medium

### Task 1.4: Move `main()` Out of `controllers/hack.ts`
**Files**: `src/controllers/hack.ts`, new `src/scripts/hack/distributed.ts`
**Description**: The controller currently has a `main()` function, violating the architecture
rule. Move `main()` to `scripts/hack/distributed.ts` that imports from the controller.
**Acceptance**: `controllers/hack.ts` has no `main()`. `scripts/hack/distributed.ts` works
identically to the old behavior. No daemon changes needed (daemons import controller functions).
**Effort**: Small

### Task 1.5: Replace Hardcoded Worker RAM
**Files**: `src/controllers/hack.ts`
**Description**: Line 557 has `const scriptRam = 1.75`. Replace with `ns.getScriptRam()`.
**Acceptance**: No hardcoded RAM values for worker scripts.
**Effort**: Tiny

### Task 1.6: Add JSDoc Headers to JS Worker Files
**Files**: `src/workers/hack.js`, `grow.js`, `weaken.js`, `share.js`
**Description**: Add documentation headers explaining why these are JS (not TS), their RAM
cost, and their argument format.
**Acceptance**: Each worker has a complete JSDoc header.
**Effort**: Tiny

### Task 1.7: Document peekQueue Race Condition
**Files**: `src/lib/ports.ts`
**Description**: Add a comment explaining that `peekQueue()` drain-and-rewrite is safe
because Bitburner's JS engine is single-threaded within a tick.
**Acceptance**: Comment added with clear explanation.
**Effort**: Tiny

### Task 1.8: Add Worker Auto-Deploy to Nuke Daemon
**Files**: `src/daemons/nuke.ts`, `src/controllers/nuke.ts`
**Description**: When the nuke daemon roots a new server, immediately SCP worker scripts
(hack.js, grow.js, weaken.js, share.js) to it. Remove or reduce deploy checks in the
hack controller.
**Acceptance**: Workers are deployed on nuke. Hack daemon no longer SCPs every cycle.
**Effort**: Small

---

## Phase 2: Config Migration

Convert each daemon to use the config system from Task 1.1. Each task is independent
and can be done in any order after Phase 1 is complete.

### Task 2.1: Migrate Hack Daemon to Config System
**Files**: `src/daemons/hack.ts`
**Config keys**: homeReserve, maxTargets, maxBatches, interval, moneyThreshold,
securityBuffer, hackPercent, strategy
**Effort**: Medium

### Task 2.2: Migrate Share Daemon to Config System
**Files**: `src/daemons/share.ts`
**Config keys**: minFree, homeReserve, interval, targetPercent
**Effort**: Small

### Task 2.3: Migrate Nuke Daemon to Config System
**Files**: `src/daemons/nuke.ts`
**Config keys**: interval, oneShot
**Effort**: Small

### Task 2.4: Migrate Queue Daemon to Config System
**Files**: `src/daemons/queue.ts`
**Config keys**: interval, scriptTimeout
**Effort**: Small

### Task 2.5: Migrate PServ Daemon to Config System
**Files**: `src/daemons/pserv.ts`
**Config keys**: interval, minRam, reserveMoney
**Effort**: Small

### Task 2.6: Migrate Darkweb Daemon to Config System
**Files**: `src/daemons/darkweb.ts`
**Config keys**: interval
**Effort**: Small

### Task 2.7: Migrate Rep Daemon to Config System
**Files**: `src/daemons/rep.ts`
**Config keys**: tier, faction, interval, noKill
**Effort**: Medium

### Task 2.8: Migrate Work Daemon to Config System
**Files**: `src/daemons/work.ts`
**Config keys**: focus, interval
**Effort**: Small

### Task 2.9: Migrate Gang Daemon to Config System
**Files**: `src/daemons/gang.ts`
**Config keys**: strategy, wantedThreshold, ascendAutoThreshold, trainingThreshold,
noKill, growTargetMultiplier, growRespectReserve
**Effort**: Medium

### Task 2.10: Migrate Faction Daemon to Config System
**Files**: `src/daemons/faction.ts`
**Config keys**: interval, autoJoin, preferredCity
**Effort**: Medium

### Task 2.11: Migrate Augments Daemon to Config System
**Files**: `src/daemons/augments.ts`
**Config keys**: interval, selectedAugs
**Effort**: Small

### Task 2.12: Migrate Infiltration Daemon to Config System
**Files**: `src/daemons/infiltration.ts`
**Config keys**: targetCompany, rewardMode, enabledSolvers
**Effort**: Medium

---

## Phase 3: Dashboard Reorganization

### Task 3.1: Create Two-Tier TabBar Component
**Files**: New or modified `src/views/dashboard/components/TabBar.tsx`
**Description**: Replace flat tab bar with grouped tabs. Top level shows groups
(Server Growth, Reputation & Factions, Personal Growth, Manual Tools). Selecting a group
shows its sub-tabs. Overview is accessible from any group.
**Acceptance**: Two-tier navigation works. Existing tab content renders correctly.
**Effort**: Medium

### Task 3.2: Define Tab Groups and Routing
**Files**: `src/views/dashboard/dashboard.tsx`, `src/views/dashboard/types.ts`
**Description**: Define the tab group structure as data. Map each tool plugin to its group.
Update routing logic in dashboard.tsx to handle two-level navigation.
**Acceptance**: All 11 existing tools are accessible via their group tabs.
**Effort**: Medium

### Task 3.3: Add Advisor Summary to Overview Panel
**Files**: `src/views/dashboard/dashboard.tsx`, new advisor component
**Description**: Read advisor status from its port and display top 3 recommendations
at the top of the Overview tab.
**Acceptance**: Overview shows advisor recommendations when advisor is running.
Falls back gracefully when advisor is not running.
**Effort**: Medium

### Task 3.4: Add Config Editing UI to Detail Panels
**Files**: Various `src/views/dashboard/tools/*.tsx`
**Description**: Each tool's detail panel gains a "Settings" section that displays current
config values and allows editing. Uses the command port to write config changes.
**Acceptance**: Can change at least one config value per tool from the dashboard.
**Effort**: Large (many files)

---

## Phase 4: Advisor System

### Task 4.1: Create Advisor Scoring Engine
**Files**: New `src/tools/advisor.ts`, new `src/types/ports.ts` additions
**Description**: Standalone script that reads all status ports + player state, scores
possible actions, and publishes top recommendations to the advisor port.
**Acceptance**: Advisor runs, scores actions, publishes to port. Dashboard can read it.
**Effort**: Large

### Task 4.2: Define Initial Scoring Rules
**Files**: `src/tools/advisor.ts` or `src/controllers/advisor.ts`
**Description**: Implement scoring rules covering early game (buy TOR, train hacking,
root servers), mid game (faction work, rep grinding, pserv upgrades), and late game
(aug planning, bitnode exit).
**Acceptance**: Reasonable recommendations across all game phases.
**Effort**: Large

### Task 4.3: Create Advisor Dashboard Plugin
**Files**: New `src/views/dashboard/tools/advisor.tsx`
**Description**: Dashboard plugin that displays advisor recommendations. Shows top 3
actions with scores, reasons, and quick-action buttons.
**Effort**: Medium

---

## Phase 5: Coding Contracts Daemon

### Task 5.1: Create Contract Solver Registry
**Files**: New `src/lib/contract-solvers/index.ts`
**Description**: Registry pattern matching contract type strings to solver functions.
Each solver takes input data and returns the answer.
**Effort**: Small

### Task 5.2: Implement Contract Solvers (batch 1 — easy)
**Files**: New `src/lib/contract-solvers/*.ts`
**Solvers**: Find Largest Prime Factor, Subarray with Maximum Sum, Total Ways to Sum I/II,
Array Jumping Game I/II, Generate IP Addresses, Merge Overlapping Intervals
**Effort**: Medium

### Task 5.3: Implement Contract Solvers (batch 2 — medium)
**Files**: New `src/lib/contract-solvers/*.ts`
**Solvers**: Spiralize Matrix, Unique Paths I/II, Minimum Path Sum, Algorithmic Stock
Trader I-IV, Sanitize Parentheses, RLE Compression
**Effort**: Medium

### Task 5.4: Implement Contract Solvers (batch 3 — hard)
**Files**: New `src/lib/contract-solvers/*.ts`
**Solvers**: Shortest Path in Grid, LZ Decompression, LZ Compression, Caesar Cipher,
Vigenere Cipher, HammingCodes encode/decode, Proper 2-Coloring
**Effort**: Large

### Task 5.5: Create Contracts Controller and Daemon
**Files**: New `src/controllers/contracts.ts`, `src/daemons/contracts.ts`
**Description**: Controller scans servers for .cct files, reads type, dispatches to solver.
Daemon runs periodically, publishes status.
**Effort**: Medium

### Task 5.6: Create Contracts Dashboard Plugin
**Files**: New `src/views/dashboard/tools/contracts.tsx`, update types/ports.ts
**Effort**: Medium

---

## Phase 6: Polish

### Task 6.1: Update README.md
**Files**: `README.md`
**Description**: Rewrite to reflect new architecture. Include config system, tab groups,
advisor, contracts. Remove outdated references.
**Effort**: Medium

### Task 6.2: Convert Remaining JS Tools to TypeScript
**Files**: `src/tools/*.js` → `src/tools/*.ts`
**Description**: Convert augments.js, colors.js, infiltration-list.js, network-monitor.js,
nmap.js, path-to.js, path-to-backdoors.js, pwned.js, slum-work.js to TypeScript.
**Effort**: Medium

### Task 6.3: Add Error Boundaries to Dashboard
**Files**: Various `src/views/dashboard/*.tsx`
**Description**: Wrap each tool plugin in a React error boundary so one crashing component
doesn't take down the whole dashboard.
**Effort**: Small
