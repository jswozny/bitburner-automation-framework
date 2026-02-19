# Bitburner Framework Refactor Specification

**Status**: Draft
**Date**: 2026-02-19
**Scope**: Architecture improvements, configuration system, UI reorganization, new subsystems

---

## 1. Context & Goals

### 1.1 Current State

The framework is a well-architected 4-layer system (views/daemons/controllers/actions) with
port-based IPC, a React dashboard, and tiered RAM support in two daemons. It automates
hacking, faction management, gang operations, infiltration, and augmentation planning.

### 1.2 Problems to Solve

1. **Early game is painful and unclear.** With 32GB home RAM, most daemons can't launch.
   There's no lightweight bootstrap, no progression guide, and no fallback when the hack
   daemon (41GB) can't fit.

2. **No centralized configuration.** Magic numbers for thresholds, intervals, and strategies
   are scattered across 20+ files. Configuration doesn't persist across augment installs
   despite home server files persisting.

3. **No in-game advisor.** The player must know what to do next from memory. The
   `prioritize.ts` tool exists but isn't integrated into the dashboard.

4. **Dashboard lacks visual hierarchy.** 12 flat tabs with no grouping. No indication of
   what matters NOW vs what's irrelevant at current game phase.

5. **Inconsistent patterns.** Tiered RAM in 2 daemons but not others. Three independent
   implementations of RAM kill-tier logic. No server scan caching.

6. **Missing subsystems.** No coding contract solver, no hacknet automation (deferred),
   no stock market automation (future).

### 1.3 Design Principles

These principles guide all decisions in this spec:

- **RAM is the fundamental constraint.** Every decision must respect that 32GB is a common
  starting point. Daemons must degrade gracefully.
- **Files persist, processes don't.** Home server files survive augment installs. Use this
  for configuration and state that should persist.
- **Individual pieces, clear guide.** Don't try to make one magic script that does everything.
  Make each script excellent, then provide a clear guide for how to combine them.
- **Config file sets defaults, dashboard overrides at runtime.** Two-layer configuration.
- **Break freely if it's better.** No backward compatibility tax. Rename, restructure,
  and reorganize as needed.
- **Decision support, not decision making.** The advisor recommends; the player decides.

### 1.4 Player Profile

- **Starting RAM**: 32GB typical
- **Bitnodes**: Multiple different BNs (framework must handle varied SF levels)
- **SF4 Level**: Working toward level 3 (currently level 2 = 4x Singularity RAM cost)
- **Play style**: Mostly AFK, occasional check-ins
- **Gang**: Combat gang (Slum Snakes) primarily
- **Augment strategy**: Context-dependent (speed installs, strategic paths, or NFG max)
- **Infiltration**: Heavy use for rep grinding
- **Interaction**: All daemons from home server, workers distributed to fleet

---

## 2. Configuration System

### 2.1 Overview

A runtime configuration system using text files in `/config/` on the home server.

### 2.2 File Format

Simple `key=value` pairs, one per line. Comments with `#`. Example:

```
# Hack daemon configuration
homeReserve=32
maxTargets=100
interval=200
moneyThreshold=0.8
securityBuffer=5
hackPercent=0.25
strategy=money
```

### 2.3 File Creation

Config files are **NOT** shipped from the source tree. Each daemon/system creates its own
config file with defaults on first run if the file doesn't exist. This means:

- No sync conflicts when pushing code changes
- Each system self-documents its own configuration
- Players can delete a config file to reset to defaults
- Config files persist across augment installs

### 2.4 Directory Structure (in-game)

```
/config/
  hack.txt          # Hack daemon settings
  share.txt         # Share daemon settings
  nuke.txt          # Nuke daemon settings
  queue.txt         # Queue runner settings
  pserv.txt         # Personal server settings
  darkweb.txt       # Darkweb daemon settings
  rep.txt           # Rep daemon settings
  work.txt          # Work daemon settings
  gang.txt          # Gang daemon settings
  faction.txt       # Faction daemon settings
  augments.txt      # Augments daemon settings
  infiltration.txt  # Infiltration daemon settings
  advisor.txt       # Advisor settings
  fleet.txt         # Fleet allocation (hack/share split)
```

### 2.5 Config Library

A shared `lib/config.ts` module that:

```typescript
// Zero extra RAM — uses only ns.read() and ns.write()
export function readConfig(ns: NS, system: string): Record<string, string>;
export function writeDefaultConfig(ns: NS, system: string, defaults: Record<string, string>): void;
export function getConfigValue(ns: NS, system: string, key: string, fallback: string): string;
export function getConfigNumber(ns: NS, system: string, key: string, fallback: number): number;
export function getConfigBool(ns: NS, system: string, key: string, fallback: boolean): boolean;
```

### 2.6 Dashboard Override

The dashboard can write to config files via `ns.write()`. When a user changes a setting in
the dashboard, it writes to the config file. On next daemon cycle, the daemon picks up the
change. No port-based config relay needed — the file IS the shared state.

### 2.7 Migration from CLI Flags

Current `ns.flags()` approach is replaced. Daemons read from config files instead.
CLI flags can still exist as overrides (flag > config file > hardcoded default), but the
config file is the primary source.

---

## 3. Dashboard Reorganization

### 3.1 Two-Tier Tab System

Replace the flat 12-tab layout with grouped tabs:

```
┌──────────────────────────────────────────────────────────┐
│ [Server Growth] [Reputation & Factions] [Growth] [Tools] │
├──────────────────────────────────────────────────────────┤
│ Sub-tabs for selected group:                             │
│ e.g., [Nuke] [Hack] [PServ] [Darkweb]                   │
├──────────────────────────────────────────────────────────┤
│ Content area                                             │
└──────────────────────────────────────────────────────────┘
```

**Group 1: Server Growth** — Infrastructure and income
- Nuke (rooting servers, fleet RAM)
- Hack (distributed hacking, batch mode, money income)
- PServ (personal server buying/upgrading)
- Darkweb (program acquisition)

**Group 2: Reputation & Factions** — Faction standing and augments
- Faction (joining factions, managing invites, backdoors)
- Rep (grinding reputation, work type selection)
- Share (share() threads for rep boost)
- Augments (purchase planning, install readiness)

**Group 3: Personal Growth** — Character stats and gang
- Work (gym/university/crime training)
- Gang (gang management, territory warfare)

**Group 4: Manual Tools** — Special-purpose automation
- Infiltrate (infiltration automation)
- Contracts (coding contract solver) — NEW
- (Future: Stocks, Go)

### 3.2 Overview Tab

The Overview tab (accessible from any group) shows summary cards from all groups. Add an
advisor summary at the top showing the top 3 recommended actions.

### 3.3 Advisor Display

The advisor publishes to a status port. The dashboard reads this and displays:
- Top 3 scored recommendations with brief explanations
- Current detected "phase" (informational, not prescriptive)
- Quick-action buttons for top recommendations where applicable

---

## 4. Advisor System

### 4.1 Architecture

The advisor is a **standalone script** (`tools/advisor.ts`) that:
1. Reads status from all daemon ports
2. Reads player stats, money, and game state
3. Scores all possible actions
4. Publishes recommendations to a status port
5. Dashboard displays the recommendations

### 4.2 Scoring System

Each possible action gets a score based on:

```typescript
interface AdvisorAction {
  id: string;                    // Unique action identifier
  label: string;                 // Human-readable description
  category: "income" | "progression" | "infrastructure" | "milestone";
  score: number;                 // Higher = more impactful right now
  reason: string;                // Why this is recommended
  command?: string;              // CLI command to execute (if applicable)
  automated?: boolean;           // Whether a daemon handles this already
}
```

### 4.3 Scoring Rules (examples)

These are illustrative, not exhaustive:

| Condition | Action | Score Modifier |
|-----------|--------|----------------|
| No TOR router, money > $200k | Buy TOR router | +100 |
| Hacking level < 50, no university running | Start university training | +80 |
| Faction invited but not joined | Join faction | +90 |
| Faction server rootable but not backdoored | Install backdoor | +85 |
| All augs purchased, money > $100B | Consider installing augments | +95 |
| Gang can recruit, < max members | Recruit gang member | +60 |
| Share not running, rep grinding active | Launch share daemon | +70 |
| Coding contracts available | Solve contracts | +50 |
| PServ affordable, < max servers | Buy personal server | +65 |

### 4.4 Port Assignment

Advisor publishes to a new status port (e.g., port 17 — currently unused).

---

## 5. Worker Auto-Deployment

### 5.1 Current Problem

The hack controller checks and SCPs workers to every server every cycle. With 50+ servers,
this adds unnecessary latency.

### 5.2 Solution

Move worker deployment to the nuke daemon. When a server is newly rooted:
1. SCP all worker scripts (hack.js, grow.js, weaken.js, share.js) immediately
2. Publish the event in the nuke status (list of newly-deployed servers)

The hack daemon no longer needs to check/deploy workers. It trusts that rooted servers
already have worker scripts.

### 5.3 Fallback

If a worker script is missing (e.g., server was rooted before this change), the hack
daemon falls back to SCP on first use. But this becomes the exception, not the rule.

---

## 6. Coding Contracts Daemon

### 6.1 Overview

A new daemon (`daemons/contracts.ts`) that:
1. Periodically scans all servers for `.cct` files
2. Reads each contract's type
3. Dispatches to the appropriate solver
4. Submits the answer
5. Publishes status to a port

### 6.2 Architecture

```
daemons/contracts.ts          — Main daemon loop + status publishing
controllers/contracts.ts      — Contract discovery and dispatch
lib/contract-solvers/         — One file per contract type
  index.ts                    — Solver registry
  prime-factor.ts             — Find Largest Prime Factor
  subarray-sum.ts             — Subarray with Maximum Sum
  spiralize-matrix.ts         — Spiralize Matrix
  merge-intervals.ts          — Merge Overlapping Intervals
  generate-ip.ts              — Generate IP Addresses
  stock-trader.ts             — Algorithmic Stock Trader I-IV
  minimum-path-sum.ts         — Minimum Path Sum in a Triangle
  unique-paths.ts             — Unique Paths in a Grid I/II
  sanitize-parens.ts          — Sanitize Parentheses in Expression
  total-ways-to-sum.ts        — Total Ways to Sum I/II
  shortest-path.ts            — Shortest Path in a Grid
  rle-compression.ts          — Compression I: RLE Compression
  lz-decompression.ts         — Compression II: LZ Decompression
  lz-compression.ts           — Compression III: LZ Compression
  caesar-cipher.ts            — Encryption I: Caesar Cipher
  vigenere-cipher.ts          — Encryption II: Vigenère Cipher
  hamming-encode.ts           — HammingCodes: Integer to Encoded Binary
  hamming-decode.ts           — HammingCodes: Encoded Binary to Integer
  proper-coloring.ts          — Proper 2-Coloring of a Graph
  array-jumping.ts            — Array Jumping Game I/II
```

### 6.3 Dashboard Integration

Under the "Manual Tools" tab group, a "Contracts" sub-tab showing:
- Contracts found / solved / failed
- Recent solves with rewards
- Any unsolvable contract types (flagged for manual attention)

### 6.4 Config

`config/contracts.txt`:
```
interval=60000
enableAutoSolve=true
skipTypes=
```

---

## 7. Code Quality Improvements

### 7.1 Deduplicate RAM Kill-Tier Logic

Three implementations exist:
- `lib/launcher.ts` — `ensureRamAndExec()`
- `lib/ram-utils.ts` — `freeRamForTarget()`
- `daemons/queue.ts` — `freeRamByKillTiers()`

**Action**: Consolidate into `lib/ram-utils.ts` as the single implementation. Both
`launcher.ts` and `queue.ts` import from `ram-utils.ts`.

### 7.2 Fix peekQueue Race Condition

`lib/ports.ts:79-104` drains and re-adds the entire queue to peek. This is not atomic.

**Action**: Replace with a different approach. Options:
- Use a separate "queue status" port that the queue daemon publishes to
- Accept the race (it's unlikely in practice since Bitburner is single-threaded per tick)
- Use a flag variable to indicate "draining in progress"

Recommended: Accept the race. Bitburner's JS engine is single-threaded within a tick, so
the drain-rewrite is atomic from the game's perspective. Add a comment explaining this.

### 7.3 Remove main() from controllers/hack.ts

Controllers should be pure libraries. The `main()` function at line 675 makes it a hybrid.

**Action**: Move `main()` to a new `scripts/hack/distributed.ts` that imports from the
controller. The controller becomes a pure library.

### 7.4 Eliminate Hardcoded Worker RAM

`controllers/hack.ts:557` has `const scriptRam = 1.75`. This should be dynamic or
configured.

**Action**: Replace with `ns.getScriptRam("/workers/hack.js")` or read from config.

### 7.5 Server Scan Caching

`getAllServers()` BFS runs multiple times per daemon cycle.

**Action**: Add a `lib/server-cache.ts` utility:

```typescript
let cachedServers: string[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 10_000; // 10 seconds

export function getCachedServers(ns: NS): string[] {
  if (cachedServers && Date.now() - cacheTime < CACHE_TTL) {
    return cachedServers;
  }
  cachedServers = getAllServers(ns);
  cacheTime = Date.now();
  return cachedServers;
}

export function invalidateServerCache(): void {
  cachedServers = null;
}
```

Call `invalidateServerCache()` in the nuke daemon after rooting new servers.

### 7.6 JS Worker Documentation

Workers are intentionally JS for minimal RAM. Add JSDoc headers explaining this:

```javascript
/**
 * Hack Worker (JavaScript intentionally — TypeScript adds import overhead)
 *
 * Minimal worker script that executes hack() on a target server.
 * Designed to be spawned by daemons with specific thread counts.
 *
 * RAM: 1.70 GB (hack only)
 *
 * Args: [target, delay, startTime, tag]
 */
```

---

## 8. Architecture Guide

A separate `ARCHITECTURE.md` document (see companion file) that serves as the single
source of truth for understanding and modifying the codebase. Covers:

1. Layer architecture and responsibilities
2. How to add a new daemon
3. How to add a new dashboard tool
4. How to add a new action
5. How ports work
6. How configuration works
7. How the advisor works
8. RAM budget guidelines
9. Naming conventions
10. File organization rules

---

## 9. Follow-Up Implementation Tasks

These are ordered by dependency (later tasks depend on earlier ones).

### Phase 1: Foundation (config + code quality)

| Task | Description | Files Affected | Effort |
|------|-------------|----------------|--------|
| 1.1 | Create `lib/config.ts` config reader/writer | New file | Small |
| 1.2 | Deduplicate RAM kill-tier logic into `lib/ram-utils.ts` | lib/launcher.ts, lib/ram-utils.ts, daemons/queue.ts | Small |
| 1.3 | Add `lib/server-cache.ts` with TTL-based caching | New file, update all getAllServers callers | Medium |
| 1.4 | Move `main()` out of `controllers/hack.ts` | controllers/hack.ts, new scripts/hack/distributed.ts | Small |
| 1.5 | Replace hardcoded worker RAM (1.75) with dynamic lookup | controllers/hack.ts | Tiny |
| 1.6 | Add JSDoc headers to all JS worker files | workers/*.js | Tiny |
| 1.7 | Document peekQueue race condition | lib/ports.ts | Tiny |
| 1.8 | Add worker auto-deploy to nuke daemon | daemons/nuke.ts, controllers/nuke.ts | Small |

### Phase 2: Config migration (convert all daemons to use config files)

| Task | Description | Files Affected | Effort |
|------|-------------|----------------|--------|
| 2.1 | Migrate hack daemon to config system | daemons/hack.ts | Medium |
| 2.2 | Migrate share daemon to config system | daemons/share.ts | Small |
| 2.3 | Migrate nuke daemon to config system | daemons/nuke.ts | Small |
| 2.4 | Migrate queue daemon to config system | daemons/queue.ts | Small |
| 2.5 | Migrate pserv daemon to config system | daemons/pserv.ts | Small |
| 2.6 | Migrate darkweb daemon to config system | daemons/darkweb.ts | Small |
| 2.7 | Migrate rep daemon to config system | daemons/rep.ts | Medium |
| 2.8 | Migrate work daemon to config system | daemons/work.ts | Small |
| 2.9 | Migrate gang daemon to config system | daemons/gang.ts | Medium |
| 2.10 | Migrate faction daemon to config system | daemons/faction.ts | Medium |
| 2.11 | Migrate augments daemon to config system | daemons/augments.ts | Small |
| 2.12 | Migrate infiltration daemon to config system | daemons/infiltration.ts | Medium |

### Phase 3: Dashboard reorganization

| Task | Description | Files Affected | Effort |
|------|-------------|----------------|--------|
| 3.1 | Create two-tier TabBar component | New component | Medium |
| 3.2 | Define tab groups and routing | dashboard.tsx, types.ts | Medium |
| 3.3 | Migrate existing tool plugins to new tab structure | All tools/*.tsx | Medium |
| 3.4 | Add advisor display to Overview panel | dashboard.tsx, new component | Medium |
| 3.5 | Add config editing UI to detail panels | Various tools/*.tsx | Large |

### Phase 4: Advisor system

| Task | Description | Files Affected | Effort |
|------|-------------|----------------|--------|
| 4.1 | Create advisor scoring engine | New tools/advisor.ts | Large |
| 4.2 | Define scoring rules for all game phases | advisor.ts | Large |
| 4.3 | Add advisor port assignment to types/ports.ts | types/ports.ts | Tiny |
| 4.4 | Create advisor dashboard component | New views/dashboard/tools/advisor.tsx | Medium |
| 4.5 | Integrate advisor into Overview tab summary | dashboard.tsx | Small |

### Phase 5: Coding contracts daemon

| Task | Description | Files Affected | Effort |
|------|-------------|----------------|--------|
| 5.1 | Create contract solver registry | New lib/contract-solvers/index.ts | Small |
| 5.2 | Implement all ~20 contract solvers | New lib/contract-solvers/*.ts | Large |
| 5.3 | Create contracts controller | New controllers/contracts.ts | Medium |
| 5.4 | Create contracts daemon | New daemons/contracts.ts | Medium |
| 5.5 | Add contracts port and status types | types/ports.ts | Small |
| 5.6 | Create contracts dashboard plugin | New views/dashboard/tools/contracts.tsx | Medium |

### Phase 6: Polish and documentation

| Task | Description | Files Affected | Effort |
|------|-------------|----------------|--------|
| 6.1 | Write ARCHITECTURE.md | New file | Large |
| 6.2 | Update README.md for new structure | README.md | Medium |
| 6.3 | Write progression guide content for advisor | advisor.ts | Medium |
| 6.4 | Convert remaining JS tools to TypeScript | tools/*.js | Medium |
| 6.5 | Add error boundaries to dashboard components | Various | Small |

---

## 10. Out of Scope (Deferred)

These items were discussed but explicitly deferred:

- **Hacknet automation daemon** — Acknowledged gap, lower priority
- **Stock market automation** — Future Manual Tools tab addition
- **Go automation** — Future Manual Tools tab addition
- **Notification milestones** — User wants to define these later
- **Watchdog/auto-restart** — Manual restart preferred for now
- **Multi-server daemon deployment** — Everything runs from home
- **Tiered RAM for all daemons** — Only expensive daemons need it; RAM matters early but
  don't over-optimize late game

---

## 11. Open Questions

These need resolution before or during implementation:

1. **Config file encoding**: Should config values support arrays? E.g.,
   `skipTypes=shortest-path,proper-coloring`. Or keep it strictly scalar?

2. **Advisor scoring weights**: The scoring rules need playtesting to calibrate. Initial
   implementation should have easily adjustable weights (in advisor config file).

3. **Dashboard tab group names**: Current proposals are "Server Growth", "Reputation &
   Factions", "Personal Growth", "Manual Tools". These should be reviewed after the
   two-tier TabBar is built.

4. **Infiltration reliability**: DOM-based automation is inherently fragile across Bitburner
   updates. Should we add a version check or compatibility detection?

5. **Contract solver completeness**: Some contract types are rare. Do we implement all 20+
   upfront or add them as encountered?
