# Codebase Deep-Dive Analysis

**Date**: 2026-02-19
**Scope**: Full repository audit — architecture, code quality, RAM, UX, maintainability

---

## Executive Summary

This is a **well-architected** Bitburner automation framework with a clean 4-layer design
(views/daemons/controllers/actions), port-based IPC, and a React dashboard. The tiered RAM
system in `rep.ts` and `gang.ts` is genuinely excellent engineering. However, there are
systemic issues that compound into a painful early-game experience and create maintenance
burden as the codebase grows.

**Top 5 Strategic Issues (ordered by impact):**

1. **No early-game mode** — The bootstrap tries to launch 8+ daemons. With 32GB home RAM,
   most silently skip. There's no lightweight "starter pack" that maximizes value per GB.
2. **No centralized configuration** — Magic numbers for thresholds, intervals, reserves, and
   strategies are scattered across 20+ files with no single place to tune them.
3. **Inconsistent RAM awareness** — `rep.ts` and `gang.ts` have the elegant tiered system;
   `hack.ts`, `work.ts`, `faction.ts`, and `share.ts` do not. This creates a two-class system.
4. **DRY violations in server scanning** — `getAllServers()` BFS is called independently in
   nearly every daemon/controller, often multiple times per cycle. No caching layer.
5. **Mixed JS/TS with no migration path** — 15+ files are plain JavaScript (workers, tools,
   scripts). Workers are JS for RAM reasons (valid), but tools and scripts have no excuse.

---

## 1. Architecture Analysis

### 1.1 Layer Design (STRONG)

```
Views (React dashboard)  →  reads ports  →  Daemons (state machines)
                                              ↓ calls
                                           Controllers (pure logic)
                                              ↓ triggers
                                           Actions (one-shot scripts)
```

**Verdict**: Clean separation. Views never call controllers directly. Daemons own their
state machines and publish to ports. Controllers are stateless business logic. Actions are
fire-and-forget. This is textbook service-oriented architecture adapted for Bitburner's
constraints.

**One concern**: The `controllers/hack.ts` file has a `main()` function and can be run
directly as a script. This blurs the controller/daemon boundary. Controllers should be
pure libraries with no `main()`.

### 1.2 Port-Based IPC (STRONG)

The `lib/ports.ts` + `types/ports.ts` pattern is excellent:
- `publishStatus<T>()` with `_publishedAt` timestamp injection
- `peekStatus<T>()` with `maxAgeMs` staleness detection
- `queueAction()` / `dequeueAction()` for the action queue
- Non-destructive reads (peek, not consume)

**Issues found**:
- `peekQueue()` in `lib/ports.ts:79-104` drains the entire queue and re-adds items just to
  peek. This is a race condition if another script reads between drain and re-add.
- Port numbers have a gap: port 12 is `INFILTRATION_CONTROL_PORT`, port 15 is
  `GANG_CONTROL_PORT`, but there's no port 17 or 18. Not a bug, but the numbering scheme
  would benefit from documentation of reserved/available slots.

### 1.3 Bootstrap Flow (NEEDS WORK)

`start.ts` launches scripts in two tiers:
- **CORE**: nuke, hack, queue, darkweb
- **OPTIONAL**: pserv, faction, augments, gang

**Problems**:
1. Core scripts use `ensureRamAndExec()` (kills lower-priority scripts if needed), but
   optional scripts use `ns.exec()` directly — they silently fail if RAM is insufficient.
2. No awareness of game phase. On a fresh bitnode with 32GB RAM, it tries to launch
   everything. It should detect "I only have 32GB, let me run nuke + a simple hacker and
   nothing else."
3. `share.ts` is not in either list — it's mentioned in the README but never auto-launched.
4. `work.ts` and `rep.ts` are manual-launch only, but they're some of the most useful
   daemons for progression.
5. The 500ms sleep between dashboard and core daemons is a magic number with no explanation.

### 1.4 Tiered RAM System (EXCELLENT — but inconsistent)

`rep.ts` implements 7 tiers (0-6) with:
- Dynamic RAM calculation via `ns.getFunctionRamCost()`
- Cumulative feature unlocking
- Graceful degradation
- Clear tier descriptions

`gang.ts` implements 3 tiers with the same pattern.

**But**: `hack.ts`, `work.ts`, `faction.ts`, `share.ts`, `pserv.ts`, `darkweb.ts`,
`nuke.ts`, `augments.ts`, and `queue.ts` have NO tiered system. They're all-or-nothing:
either you have enough RAM or you don't.

**Recommendation**: Extract the tiered pattern into a shared `lib/tiered-daemon.ts` utility
so any daemon can adopt it with minimal boilerplate.

---

## 2. Code Quality Analysis

### 2.1 TypeScript Quality

**Strengths**:
- `strict: true` in tsconfig — good
- Central type definitions in `types/ports.ts` (888 lines) — good single source of truth
- Path aliases (`@ns`, `@react`) for clean imports
- Proper use of discriminated unions for status types

**Weaknesses**:
- `ns.flags()` return types use `as` type assertions everywhere:
  ```typescript
  const flags = ns.flags([...]) as { "one-shot": boolean; interval: number; _: string[] };
  ```
  This is fragile. A shared `parseFlags<T>()` utility with runtime validation would be safer.
- Several controllers export both types AND a `main()` function (e.g., `controllers/hack.ts`).
  Controllers should not have `main()`.
- `HackAction` is defined in `lib/utils.ts` but also conceptually exists in `lib/batch.ts`
  and `types/ports.ts` via the `"hack" | "grow" | "weaken"` union. Some consolidation needed.

### 2.2 Magic Numbers Inventory

| File | Magic Number | What It Is |
|------|-------------|------------|
| `start.ts:53` | `500` | ms sleep after dashboard launch |
| `daemons/hack.ts:63` | `0.8` | money threshold |
| `daemons/hack.ts:64` | `5` | security buffer |
| `daemons/hack.ts:65` | `0.25` | hack percent |
| `controllers/hack.ts:679` | `32` | home reserve GB |
| `controllers/hack.ts:680` | `100` | max targets |
| `daemons/share.ts:28` | `2000` | grace period ms |
| `daemons/share.ts:129` | `4` | min free RAM GB |
| `daemons/share.ts:130` | `32` | home reserve GB |
| `daemons/share.ts:131` | `10000` | interval ms |
| `daemons/nuke.ts:139` | `30000` | interval ms |
| `daemons/queue.ts:249` | `2000` | interval ms |
| `daemons/queue.ts:115` | `30000` | script timeout ms |
| `lib/batch.ts:13` | `200` | batch spacer ms |
| `lib/batch.ts:16-19` | `0.002/0.004/0.05` | security per action |
| `lib/batch.ts:20` | `0.999` | prep money tolerance |
| `daemons/rep.ts:172-176` | `30/100B/2500` | bitnode requirements |
| `daemons/rep.ts:134` | `0.05` | RAM buffer percent |
| `controllers/hack.ts:557` | `1.75` | hardcoded worker RAM |

**Recommendation**: Create `src/config.ts` — a zero-RAM configuration module that exports
all tunable constants grouped by system. Each daemon imports what it needs. One file to
change everything.

### 2.3 DRY Violations

**Server scanning**: `getAllServers()` is called independently in:
- `controllers/hack.ts` (2x: `getUsableServers` + `getTargets`)
- `controllers/nuke.ts` (2x: `analyzeNukableServers` + `getNukeStatus`)
- `daemons/nuke.ts` (1x: `computeNukeStatus`)
- `daemons/share.ts` (indirectly via controller)
- `lib/batch.ts` (1x: `selectXpTarget`)
- Several tool scripts

Each call does a full BFS traversal. In a single daemon cycle, the same BFS might run 2-3
times. There should be a `serverCache` that's valid for a configurable TTL.

**RAM kill-tier logic**: Nearly identical code exists in:
- `lib/launcher.ts` (`ensureRamAndExec` + `dryRunEnsureRamAndExec`)
- `lib/ram-utils.ts` (`calcAvailableAfterKills` + `freeRamForTarget`)
- `daemons/queue.ts` (`freeRamByKillTiers`)

Three separate implementations of "walk tiers and kill stuff." Should be ONE function in
`lib/ram-utils.ts`.

**Status formatting**: The `computeXxxStatus()` pattern is duplicated in every daemon.
Each one: gathers raw data → formats numbers → builds status object → publishes to port.
This could be a shared pattern/utility.

### 2.4 Error Handling

- Most daemons have `ns.disableLog("ALL")` which hides errors. Good for clean output,
  but errors disappear silently.
- `peekStatus()` swallows JSON parse errors with `catch { return null }`. Good for
  resilience, but a corrupted port becomes invisible.
- No daemon has a top-level try/catch in its main loop. If an unexpected error occurs,
  the daemon dies silently and the dashboard just shows "not running."
- The queue runner has a 30s timeout for scripts (`waitForScript`), but some operations
  (like `purchase-augments.ts`) could legitimately take longer.

---

## 3. Early Game vs Late Game Analysis

### 3.1 The Core Problem

The codebase was built feature-by-feature for late-game power. Early game was never
explicitly designed for. Evidence:

1. **start.ts** tries to launch dashboard (3.8GB) + nuke (5.4GB) + hack (41GB) + queue
   (4.5GB) + darkweb (5.7GB) = **~60GB minimum** just for core daemons. A fresh bitnode
   starts with 8-32GB.

2. **hack daemon** (41GB) is the second thing launched. On a fresh start, you can't afford
   it. The simple hacker scripts exist (`scripts/hack/simple.ts`) but aren't auto-launched.

3. **No automatic fallback**. If hack daemon can't launch, nothing takes its place. The
   player must manually run `scripts/hack/simple.js n00dles`.

4. **Darkweb daemon** tries to buy programs automatically but has no awareness of whether
   the player can even afford a TOR router ($200k). It runs needlessly for potentially
   hours.

5. **The queue's round-robin status checks** run `check-work.js`, `check-darkweb.js`,
   `check-factions.js`, `check-territory.js` — all Singularity calls that cost RAM. In
   early game, this RAM is desperately needed for hacking.

### 3.2 What Early Game Actually Needs

With 8-32GB RAM, the optimal Bitburner strategy is:
1. Nuke what you can (nuke daemon: ~5GB — affordable)
2. Run a simple hacker on the best target (simple.ts: ~2GB — affordable)
3. Buy TOR + programs as money allows (manual or lightweight check)
4. Train hacking at university if level is low

The framework provides all these pieces but doesn't assemble them for the early game.

### 3.3 What Late Game Has (and it's good)

- Batch hacking with HWGW timing (sophisticated)
- Auto rep grinding with 7 tiers
- Gang management with 3 tiers
- Infiltration automation with 10 solvers
- Augment purchase planning
- Fleet allocation between hacking and sharing
- NeuroFlux Governor donation planning

This is genuinely impressive late-game automation.

---

## 4. Configuration & Maintainability

### 4.1 Configuration Today

There is **no centralized configuration**. Each daemon uses `ns.flags()` for CLI args with
hardcoded defaults:
- `hack.ts`: `--home-reserve 32`, `--max-targets 100`, `--interval 200`
- `share.ts`: `--min-free 4`, `--home-reserve 32`, `--interval 10000`
- `nuke.ts`: `--interval 30000`
- `queue.ts`: `--interval 2000`

The `types/ports.ts` has a `DaemonConfig` interface (lines 80-106) that defines config
fields like `shareTargetPercent`, `hackStrategy`, `gangStrategy`, etc. — but it's not
used as a configuration system. It appears to be for dashboard commands.

### 4.2 What's Needed

A `src/config.ts` that:
- Exports all tunable constants (intervals, thresholds, reserves)
- Has zero RAM cost (no NS function calls, just `export const`)
- Groups config by system (hack, share, nuke, early-game, etc.)
- Is the ONE file an AI agent reads to understand all tunables
- Could eventually be overridden by a JSON file or port-based config

---

## 5. UI/UX Flow Analysis

### 5.1 Dashboard Plugin System (GOOD)

Each tool provides `OverviewCard` + `DetailPanel`. The tab-based navigation works.
The `ToolControl` component provides start/stop controls.

### 5.2 Progression Clarity (NEEDS WORK)

The dashboard shows ALL tools equally — nuke, hack, pserv, share, faction, rep, augs,
work, darkweb, infiltration, gang. There's no visual hierarchy indicating:
- "You should focus on THIS right now"
- "This tool isn't useful yet (you're too early)"
- "Congratulations, this milestone is complete"

The `tools/prioritize.ts` script exists and analyzes game state to suggest next actions,
but it's a CLI tool, not integrated into the dashboard.

### 5.3 README Cheat Sheet (GOOD but incomplete)

The README has Early/Mid/Late tables. But:
- No mention of infiltration
- No mention of gang
- Share daemon isn't in `start.ts` despite being mentioned
- No "what to do on a fresh bitnode" walkthrough

---

## 6. File-by-File Issues

### 6.1 controllers/hack.ts — Has `main()` function
Controllers shouldn't be runnable. The `main()` at line 675 makes this a hybrid. Either
it's a controller (library) or a script (runnable). Not both.

### 6.2 lib/batch.ts:557 — Hardcoded worker RAM
```typescript
const scriptRam = 1.75; // Standard worker RAM
```
This should be `ns.getScriptRam("/workers/hack.js")` or a config constant.

### 6.3 lib/ports.ts:79-104 — peekQueue race condition
The drain-and-rewrite pattern is not atomic. If another script reads mid-drain, entries
are lost.

### 6.4 daemons/rep.ts:172-176 — Hardcoded bitnode requirements
```typescript
const BITNODE_REQUIREMENTS = { augmentations: 30, money: 100_000_000_000, hacking: 2500 };
```
These vary by bitnode. Should be configurable or detected.

### 6.5 Workers are JS (intentionally) — but lack JSDoc
`workers/hack.js`, `grow.js`, `weaken.js`, `share.js` are plain JS for RAM minimization.
This is correct, but they have no documentation headers explaining why they're JS.

### 6.6 tools/ directory — mixed JS/TS with no pattern
Some tools are `.js`, some `.ts`. No consistency in argument handling, output formatting,
or error handling between them.

---

## 7. Recommendations Priority Matrix

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Create `config.ts` centralized configuration | Medium | High |
| P0 | Add early-game bootstrap mode to `start.ts` | Medium | High |
| P1 | Extract tiered daemon pattern to shared lib | High | High |
| P1 | Deduplicate RAM kill-tier logic | Low | Medium |
| P1 | Fix `peekQueue` race condition | Low | Medium |
| P2 | Remove `main()` from `controllers/hack.ts` | Low | Low |
| P2 | Add JSDoc headers to all JS worker files | Low | Low |
| P2 | Integrate `prioritize.ts` logic into dashboard | High | High |
| P3 | Convert remaining JS tools to TypeScript | Medium | Low |
| P3 | Add server scan caching layer | Medium | Medium |

---

## 8. What an AI Agent Needs (Single Source of Truth)

For an AI to confidently modify this codebase, it needs ONE document that answers:
1. Where does configuration live? → `config.ts`
2. How do I add a new daemon? → Follow the daemon template pattern
3. How do I add a new dashboard tool? → Follow the plugin pattern
4. How do ports work? → `types/ports.ts` for types, `lib/ports.ts` for I/O
5. What's the RAM budget? → Tiered system in daemon, config for thresholds
6. How do I add a new action? → Follow the action template pattern
7. How does early game differ? → Bootstrap mode detection in `start.ts`

This document should be `ARCHITECTURE.md` and kept rigorously up to date.
