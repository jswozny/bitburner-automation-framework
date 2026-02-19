# Architecture Guide

**Purpose**: Single source of truth for understanding, modifying, and extending this codebase.
Intended for both human developers and AI agents.

---

## 1. System Overview

This is a Bitburner automation framework. Bitburner is an incremental hacking game where
you write JavaScript/TypeScript scripts that run inside the game. Key constraints:

- **RAM is currency.** Every NS function call costs RAM. A script's RAM cost is the sum of
  all NS functions it references (even if not called). Importing a module costs its RAM too.
- **Home server files persist across augment installs.** Scripts, config files, and data
  files survive resets. Running processes do not.
- **Single-threaded per tick.** Scripts run cooperatively. `await ns.sleep()` yields control.
- **Workers deploy to remote servers.** Only `home` has your full codebase. Workers must be
  SCP'd to other servers before they can run there.

### Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│  VIEWS (React Dashboard)                             │
│  Read status from ports. Render UI. Send commands.   │
│  Location: views/                                    │
│  RAM: ~12 GB (React + all imports)                   │
└────────────────────┬────────────────────────────────┘
                     │ reads ports
┌────────────────────▼────────────────────────────────┐
│  DAEMONS (Long-running services)                     │
│  Own state machines. Publish status to ports.        │
│  Call controllers for business logic.                │
│  Location: daemons/                                  │
│  RAM: 5-40+ GB each (varies by tier)                │
└────────────────────┬────────────────────────────────┘
                     │ calls functions
┌────────────────────▼────────────────────────────────┐
│  CONTROLLERS (Pure business logic)                   │
│  Stateless functions. No main loops. No ports.       │
│  Location: controllers/                              │
│  RAM: Inherited by importing daemon                  │
└────────────────────┬────────────────────────────────┘
                     │ triggers
┌────────────────────▼────────────────────────────────┐
│  ACTIONS (One-shot scripts)                          │
│  Execute once and exit. Triggered by queue or CLI.   │
│  Location: actions/                                  │
│  RAM: 2-10 GB each                                  │
└─────────────────────────────────────────────────────┘
```

### Supporting Layers

```
WORKERS (workers/*.js)     — Minimal scripts (hack/grow/weaken/share), deployed to fleet
LIB (lib/*.ts)             — Shared utilities (ports, launcher, config, batch math, DOM)
TYPES (types/*.ts)         — Type definitions and constants (zero RAM cost)
TOOLS (tools/*.ts)         — CLI utilities and the advisor
CONFIG (/config/*.txt)     — Runtime config files on home server (not in source tree)
```

---

## 2. Port System

Daemons communicate via Bitburner's port system. Each daemon publishes a JSON status
object to its assigned port. The dashboard reads (peeks) these ports to display status.

### Port Assignments (from types/ports.ts)

| Port | Name | Publisher | Consumer |
|------|------|-----------|----------|
| 1 | nuke | daemons/nuke | dashboard |
| 2 | hack | daemons/hack | dashboard, share daemon |
| 3 | pserv | daemons/pserv | dashboard |
| 4 | share | daemons/share | dashboard, hack daemon |
| 5 | rep | daemons/rep | dashboard |
| 6 | work | daemons/work | dashboard |
| 7 | darkweb | daemons/darkweb | dashboard |
| 8 | bitnode | daemons/rep | dashboard |
| 9 | faction | daemons/faction | dashboard |
| 10 | fleet | daemons/hack | share daemon |
| 11 | infiltration | daemons/infiltration | dashboard |
| 12 | infiltration-ctrl | dashboard | daemons/infiltration |
| 13 | gang | daemons/gang | dashboard |
| 14 | gangTerritory | daemons/gang | dashboard |
| 15 | gang-ctrl | dashboard | daemons/gang |
| 16 | augments | daemons/augments | dashboard |
| 17 | advisor | tools/advisor | dashboard |
| 18 | contracts | daemons/contracts | dashboard |
| 19 | queue | any | daemons/queue |
| 20 | command | dashboard | daemons (via queue) |

### Port Communication Patterns

**Status publishing** (daemon → port → dashboard):
```typescript
import { publishStatus } from "/lib/ports";
import { STATUS_PORTS, MyStatus } from "/types/ports";

const status: MyStatus = { /* ... */ };
publishStatus(ns, STATUS_PORTS.myDaemon, status);
```

**Status reading** (dashboard/other daemon → port):
```typescript
import { peekStatus } from "/lib/ports";
import { STATUS_PORTS, MyStatus } from "/types/ports";

const status = peekStatus<MyStatus>(ns, STATUS_PORTS.myDaemon, 30_000); // 30s staleness
if (status) { /* use it */ }
```

**Action queuing** (any → queue port → queue daemon):
```typescript
import { queueAction } from "/lib/ports";
import { PRIORITY } from "/types/ports";

queueAction(ns, {
  script: "actions/my-action.js",
  args: ["--flag", "value"],
  priority: PRIORITY.USER_ACTION,
  mode: "force",  // or "queue"
  timestamp: Date.now(),
  requester: "my-daemon",
});
```

---

## 3. Configuration System

### 3.1 How It Works

Config files live at `/config/*.txt` on the home server. They are NOT in the source tree.
Each daemon creates its own config file with defaults on first run.

### 3.2 Using Configuration in a Daemon

```typescript
import { readConfig, writeDefaultConfig, getConfigNumber } from "/lib/config";

// Define defaults
const DEFAULTS = {
  interval: "30000",
  homeReserve: "32",
  maxTargets: "100",
};

// In main(), ensure config exists
writeDefaultConfig(ns, "hack", DEFAULTS);  // No-op if file already exists

// Read values (returns string, use typed getters)
const interval = getConfigNumber(ns, "hack", "interval", 30000);
const reserve = getConfigNumber(ns, "hack", "homeReserve", 32);
```

### 3.3 Config File Format

```
# Comment lines start with #
key=value
anotherKey=42
booleanKey=true
```

No sections, no nesting, no arrays. Keep it simple for in-game editing.

---

## 4. How To: Add a New Daemon

Follow this checklist to add a new daemon (e.g., "contracts"):

### Step 1: Define types (types/ports.ts)

```typescript
// 1. Add port assignment
export const STATUS_PORTS = {
  // ... existing ports ...
  contracts: 18,  // Pick next available port number
};

// 2. Add to ToolName union
export type ToolName = /* existing */ | "contracts";

// 3. Define status interface
export interface ContractsStatus {
  found: number;
  solved: number;
  failed: number;
  lastSolve: string | null;
  // ...
}

// 4. Add to DashboardState
export interface DashboardState {
  // ... existing ...
  contractsStatus: ContractsStatus | null;
}
```

### Step 2: Create controller (controllers/contracts.ts)

```typescript
/**
 * Contracts Controller
 *
 * Pure business logic for finding and solving coding contracts.
 * No main loop. No port publishing. No state.
 */
import { NS } from "@ns";

export function findContracts(ns: NS): ContractInfo[] { /* ... */ }
export function solveContract(ns: NS, info: ContractInfo): boolean { /* ... */ }
```

### Step 3: Create daemon (daemons/contracts.ts)

```typescript
/**
 * Contracts Daemon
 *
 * Long-running daemon that finds and solves coding contracts.
 * Publishes ContractsStatus to port 18.
 *
 * Usage: run daemons/contracts.js
 *
 * Config: /config/contracts.txt
 *   interval=60000        # How often to scan (ms)
 *   enableAutoSolve=true  # Auto-solve or just report
 */
import { NS } from "@ns";
import { publishStatus } from "/lib/ports";
import { STATUS_PORTS, ContractsStatus } from "/types/ports";
import { readConfig, writeDefaultConfig, getConfigNumber, getConfigBool } from "/lib/config";
import { findContracts, solveContract } from "/controllers/contracts";

const CONFIG_DEFAULTS = {
  interval: "60000",
  enableAutoSolve: "true",
};

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  writeDefaultConfig(ns, "contracts", CONFIG_DEFAULTS);

  while (true) {
    const interval = getConfigNumber(ns, "contracts", "interval", 60000);
    // ... daemon logic ...
    publishStatus(ns, STATUS_PORTS.contracts, status);
    await ns.sleep(interval);
  }
}
```

### Step 4: Create dashboard plugin (views/dashboard/tools/contracts.tsx)

```typescript
import { ContractsStatus, OverviewCardProps, DetailPanelProps } from "/types/ports";

function ContractsOverview({ status, running }: OverviewCardProps<ContractsStatus>) {
  // Return a summary card
}

function ContractsDetail({ status, running }: DetailPanelProps<ContractsStatus>) {
  // Return a full detail panel
}

export const contractsPlugin = {
  OverviewCard: ContractsOverview,
  DetailPanel: ContractsDetail,
};
```

### Step 5: Register in dashboard (views/dashboard/dashboard.tsx)

1. Import the plugin
2. Add to the appropriate tab group
3. Add port reading in `state-store.ts`

### Step 6: Add config defaults documentation

The daemon creates `/config/contracts.txt` on first run. Document the available keys
in the daemon's file header comment.

---

## 5. How To: Add a New Action

Actions are one-shot scripts triggered by the queue daemon or CLI.

```typescript
/**
 * My Action
 *
 * Brief description of what this does.
 *
 * Usage: run actions/my-action.js [--flag value]
 * Queue: Triggered by [daemon/system name] with priority PRIORITY.X
 *
 * RAM: ~X.X GB
 */
import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ["flag", "default"],
  ]) as { flag: string; _: string[] };

  // Do the thing
  ns.tprint("Result: ...");
}
```

Actions should:
- Be idempotent (safe to run multiple times)
- Print results to terminal (ns.tprint)
- Exit when done (no loops)
- Use `ns.flags()` for arguments

---

## 6. How To: Add a New Dashboard Tool Plugin

Each plugin provides two React components:

```typescript
// OverviewCard: Summary for the Overview tab (2-3 lines max)
function MyToolOverview({ status, running, toolId }: OverviewCardProps<MyStatus>) {
  return <div>...</div>;
}

// DetailPanel: Full panel when tab is selected
function MyToolDetail({ status, running, toolId }: DetailPanelProps<MyStatus>) {
  return <div>...</div>;
}

export const myPlugin = { OverviewCard: MyToolOverview, DetailPanel: MyToolDetail };
```

The plugin does NOT call NS functions. It only reads from the status object (which came
from a port). This ensures the dashboard has predictable RAM cost.

---

## 7. RAM Budget Guidelines

| Category | Target RAM | Rationale |
|----------|-----------|-----------|
| Workers | < 2 GB | Spawned in hundreds across fleet |
| Actions | < 10 GB | One-shot, run and exit |
| Lightweight daemons | < 8 GB | Nuke, darkweb, queue, pserv |
| Medium daemons | 8-30 GB | Share, faction, work, augments |
| Heavy daemons | 30+ GB | Hack, rep, gang (use tiered system) |
| Dashboard | ~12 GB | React overhead, runs on home only |
| Advisor | < 8 GB | Reads ports only, minimal NS calls |

### Tiered Daemon Pattern

For daemons that use expensive NS functions (Singularity, Formulas, Gang API), use the
tiered pattern from `rep.ts`/`gang.ts`:

1. Define tiers with cumulative NS function lists
2. Calculate tier RAM dynamically with `ns.getFunctionRamCost()`
3. Select highest affordable tier at startup
4. Degrade gracefully — lower tiers show less data but still function

Use this pattern when a daemon's full feature set exceeds ~15GB.

---

## 8. Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Daemon files | `daemons/{name}.ts` | `daemons/contracts.ts` |
| Controller files | `controllers/{name}.ts` | `controllers/contracts.ts` |
| Action files | `actions/{verb}-{noun}.ts` | `actions/buy-program.ts` |
| Worker files | `workers/{action}.js` | `workers/hack.js` |
| Tool files | `tools/{name}.ts` | `tools/advisor.ts` |
| Dashboard plugins | `views/dashboard/tools/{name}.tsx` | `tools/contracts.tsx` |
| Lib files | `lib/{purpose}.ts` | `lib/config.ts` |
| Type files | `types/{scope}.ts` | `types/ports.ts` |
| Config files (in-game) | `/config/{daemon}.txt` | `/config/hack.txt` |
| Port status interfaces | `{Name}Status` | `ContractsStatus` |
| Controller functions | `verbNoun()` | `findContracts()` |
| Daemon functions | `computeXxxStatus()` | `computeContractsStatus()` |

### File Header Template

Every file should have a JSDoc header:

```typescript
/**
 * {Title}
 *
 * {One-paragraph description of purpose and role in the architecture.}
 *
 * Usage: {How to run this, if applicable}
 *
 * Config: {Config file path and key descriptions, if applicable}
 *
 * RAM: ~{X.X} GB {(breakdown if helpful)}
 *
 * Port: {Port number and direction, if applicable}
 *   Publishes: {StatusType} to port {N}
 *   Reads: {StatusType} from port {N}
 */
```

---

## 9. File Organization Rules

1. **Controllers have no `main()` function.** They are pure libraries.
2. **Daemons have exactly one `main()` function** with an infinite loop.
3. **Actions have exactly one `main()` function** that runs once and exits.
4. **Workers are JavaScript** for minimal RAM. TypeScript adds import overhead.
5. **Types files import nothing** and cost zero RAM.
6. **Lib files may import from types/ and other lib/ files**, never from
   controllers/, daemons/, or views/.
7. **Controllers may import from lib/ and types/**, never from daemons/ or views/.
8. **Daemons may import from controllers/, lib/, and types/**.
9. **Views may import from lib/ and types/**. Never from controllers/ or daemons/.
10. **Config files are runtime artifacts**, not source files. Never check them in.

### Import Dependency Graph (allowed directions)

```
types/  ←  lib/  ←  controllers/  ←  daemons/
  ↑         ↑                           ↑
  └─────────┴──── views/ ───────────────┘
                    (reads ports, not direct imports from daemons)
```

---

## 10. Dashboard Tab Groups

The dashboard uses a two-tier tab system:

| Group | Sub-tabs | Focus |
|-------|----------|-------|
| **Server Growth** | Nuke, Hack, PServ, Darkweb | Infrastructure and income |
| **Reputation & Factions** | Faction, Rep, Share, Augs | Faction standing and augments |
| **Personal Growth** | Work, Gang | Character stats and gang |
| **Manual Tools** | Infiltrate, Contracts | Special-purpose automation |

The Overview is accessible from any group and shows summary cards plus advisor recommendations.

---

## 11. Key Patterns to Follow

### Daemon Main Loop Pattern

```typescript
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  writeDefaultConfig(ns, "myDaemon", DEFAULTS);

  while (true) {
    ns.clearLog();
    const config = readConfig(ns, "myDaemon");

    // 1. Read external state (ports, game state)
    // 2. Run business logic (via controller)
    // 3. Compute status object
    // 4. Publish status to port
    // 5. Print to script log

    publishStatus(ns, STATUS_PORTS.myDaemon, status);
    await ns.sleep(interval);
  }
}
```

### Status Object Pattern

Status objects should contain:
- Pre-formatted display strings (the dashboard shouldn't do math)
- Raw values where the dashboard needs to make decisions
- Metadata (tier info, RAM usage, feature availability)
- Never NS objects or functions (not serializable)

---

## 12. Quick Reference: All Daemons

| Daemon | Port | Config File | RAM Range | Tiered? |
|--------|------|-------------|-----------|---------|
| nuke | 1 | config/nuke.txt | ~5 GB | No |
| hack | 2 | config/hack.txt | ~15-41 GB | No (should be) |
| pserv | 3 | config/pserv.txt | ~5 GB | No |
| share | 4 | config/share.txt | ~5 GB | No |
| rep | 5 | config/rep.txt | ~5-415 GB | Yes (7 tiers) |
| work | 6 | config/work.txt | ~15 GB | No |
| darkweb | 7 | config/darkweb.txt | ~6 GB | No |
| faction | 9 | config/faction.txt | ~8-18 GB | Partial |
| infiltration | 11 | config/infiltration.txt | ~25 GB | No |
| gang | 13 | config/gang.txt | ~5-29 GB | Yes (3 tiers) |
| augments | 16 | config/augments.txt | ~9 GB | No |
| queue | 19 | config/queue.txt | ~5 GB | No |
| advisor | 17 | config/advisor.txt | ~8 GB | No |
| contracts | 18 | config/contracts.txt | ~5 GB | No |
