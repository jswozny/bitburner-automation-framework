# Bitburner Scripts

Automation framework for [Bitburner](https://danielyxie.github.io/bitburner/). Requires SF4 (Singularity) for most features.

## Quick Start

```
run start.js
```

Launches the dashboard, core daemons (nuke, hack, queue, darkweb), and optional daemons (pserv, faction, augments, gang, advisor, contracts) if RAM permits. Safe to re-run -- skips anything already running.

## Architecture

All daemons publish status to numbered Netscript ports. The React dashboard reads those ports to display live state. Commands flow back from the dashboard via a command port. Daemons read config from `/config/{system}.txt` files that can be edited in-game or through the dashboard.

```
  Dashboard (React)
      │  reads ports
      ▼
  Status Ports ◄── Daemons (long-running)
      │                │
      │                ├── Controllers (pure logic, zero RAM)
      │                └── Config files (/config/*.txt)
      │
  Command Port ──► Main loop dispatches
```

## Gameplay Cheat Sheet

### Early Bitnode (low RAM, low hacking)

| Goal | Command |
|------|---------|
| Root everything you can | `run start.js` (nuke daemon handles this) |
| Backdoor faction servers | `run actions/faction-backdoors.js` |
| Buy darkweb programs | Automatic via queue daemon, or `run actions/buy-tor.js` / `run actions/buy-program.js --program BruteSSH.exe` |
| Grind hacking XP | `run scripts/hack/simple.js n00dles` |
| Attack a single target | `run scripts/hack/shotgun.js auto` |

### Mid-Game (100+ GB RAM, decent hacking)

| Goal | Command |
|------|---------|
| Distributed hacking (money) | Automatic via `daemons/hack.js` from start.js |
| Buy/upgrade personal servers | Automatic via `daemons/pserv.js` from start.js |
| Boost faction rep gain | Automatic via `daemons/share.js` from start.js |
| Train combat stats | `run daemons/work.js --focus balance-combat` |
| Train hacking | `run daemons/work.js --focus hacking` |
| Grind money via crime | `run daemons/work.js --focus crime-money` |
| Work for a faction | `run actions/work-for-faction.js --faction CyberSec --type hacking` |

### Late Game (buying augments, resetting)

| Goal | Command |
|------|---------|
| Auto-grind rep for next aug | `run daemons/rep.js` |
| Preview affordable augments | `run actions/purchase-augments.js --dry-run` |
| Buy all affordable augments | `run actions/purchase-augments.js` |
| Buy NeuroFlux Governor | `run actions/purchase-neuroflux.js` |
| Donate for NFG (150+ favor) | `run actions/neuroflux-donate.js --confirm` |
| Install augments and reset | `run actions/install-augments.js --confirm` |

### Work Focus Options

Set via dashboard or: `run actions/set-work-focus.js --focus FOCUS`

| Focus | What it does |
|-------|-------------|
| `strength` / `defense` / `dexterity` / `agility` | Train one combat stat at best gym |
| `hacking` / `charisma` | Train at best university |
| `balance-combat` | Rotate through combat stats, training the lowest |
| `balance-all` | Rotate through all stats |
| `crime-money` | Commit most profitable crime |
| `crime-stats` | Commit best crime for combat XP |

## Daemons

Started by `start.js` or launched manually. All publish status to ports for the dashboard. Each daemon reads its config from `/config/{name}.txt`.

| Daemon | Purpose |
|--------|---------|
| `daemons/nuke.js` | Root servers as hacking/tools allow |
| `daemons/hack.js` | Distributed hack/grow/weaken across all rooted servers |
| `daemons/queue.js` | Execute queued one-shot actions, rotate status checks |
| `daemons/pserv.js` | Buy and upgrade personal servers |
| `daemons/share.js` | Fill spare RAM with `share()` for rep boost |
| `daemons/rep.js` | Auto-grind faction rep toward next augmentation |
| `daemons/work.js` | Auto-train stats at gyms/universities/crime |
| `daemons/darkweb.js` | Auto-buy darkweb programs (exits when all owned) |
| `daemons/faction.js` | Auto-join factions, track requirements and invitations |
| `daemons/infiltration.js` | Automated infiltration runs with mini-game solvers |
| `daemons/gang.js` | Gang management (tasks, ascension, equipment, territory) |
| `daemons/augments.js` | Track available/affordable augmentations |
| `daemons/advisor.js` | Analyze game state and rank recommended actions |
| `daemons/contracts.js` | Find and auto-solve coding contracts on all servers |
| `daemons/budget.js` | Capital allocation across spending systems (pserv, stocks, etc.) |
| `daemons/stocks.js` | Stock market trading (tiered: monitor, pre-4S MA, 4S forecast) |

## Dashboard

The React dashboard (`views/dashboard/dashboard.js`) provides live monitoring and control for all daemons. It uses a two-tier grouped tab layout:

| Group | Tabs |
|-------|------|
| Servers | Nuke, Hack, PServ, Darkweb |
| Rep & Factions | Faction, Rep, Share, Augs |
| Money | Work, Budget, Stocks, Gang |
| Tools | Infiltrate, Contracts |

The Overview tab shows all tools at a glance with the Advisor's recommendations at the top. Each plugin has an OverviewCard (summary) and a DetailPanel (full view). Error boundaries wrap every plugin so a crash in one panel won't take down the dashboard.

## Tools

| Tool | Purpose |
|------|---------|
| `tools/prioritize.js` | Analyze game state, suggest next action |
| `tools/launch.js SCRIPT` | RAM-aware launcher (kills workers if needed) |
| `tools/nmap.js` | Network map with sorting and filtering |
| `tools/network-monitor.js` | Real-time hacking activity dashboard |
| `tools/path-to.js HOST` | Show connect path to a server |
| `tools/path-to-backdoors.js` | Show paths to faction backdoor targets |
| `tools/pwned.js` | List/manage rooted servers |
| `tools/slum-work.js` | Crime analysis (money, XP, karma rates) |
| `tools/augments.js` | List installed and pending augmentations |
| `tools/infiltration-list.js` | List infiltration locations by difficulty |
| `tools/colors.js` | ANSI color reference chart |
| `tools/backdoor.js` | Backdoor a server via Singularity |
| `tools/karma.js` | Track karma progress |
| `tools/debug/peek-ports.js` | Inspect status port data |
| `tools/debug/ram-audit.js` | RAM cost audit of all scripts |
| `tools/debug/file-diff.js` | Find orphaned/missing files on server |

## Config System

Each daemon reads config from `/config/{name}.txt` on startup and re-reads periodically. Config files use a simple `key=value` format with `#` comments. Defaults are written automatically on first run.

Example (`/config/hack.txt`):
```
# Home RAM to reserve (GB)
homeReserve=64
# Max simultaneous targets
maxTargets=8
```

### Stocks Config (`/config/stocks.txt`)

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Enable/disable trading |
| `pollInterval` | `6000` | Price poll interval (ms) |
| `smartMode` | `true` | Adjust confidence based on hack daemon targets |
| `preThreshold` | `0.03` | MA deviation threshold for pre-4S signals |
| `forecastThreshold` | `0.01` | Forecast deviation threshold for 4S signals |
| `maWindow` | `12` | Moving average window size |
| `minConfidence` | `0.55` | Minimum forecast confidence for 4S trades |
| `stopLossPercent` | `0.05` | Hard stop-loss (5% from entry) |
| `trailingStopPercent` | `0.08` | Trailing stop (8% from peak) |
| `maxHoldTicks` | `60` | Max ticks to hold a position (0 = unlimited) |

### Budget Config (`/config/budget.txt`)

| Key | Default | Description |
|-----|---------|-------------|
| `interval` | `2000` | Status update interval (ms) |
| `reserveFraction` | `0.01` | Emergency reserve fraction |
| `weight.stocks` | `50` | T2 weight for stock investments |
| `weight.servers` | `25` | T2 weight for personal servers |
| `weight.gang` | `15` | T2 weight for gang equipment |
| `weight.hacknet` | `10` | T2 weight for hacknet (no consumer yet) |

## Contracts

The contracts daemon scans all servers for `.cct` files and solves them automatically using 28 built-in solvers covering all known contract types. Solved contracts are logged to the dashboard.

## Project Structure

```
src/
  start.ts              Entry point (bootstrap)
  actions/              One-shot scripts (buy, travel, install, etc.)
  controllers/          Business logic (no main loops, zero RAM cost)
  daemons/              Long-running services with status publishing
  scripts/              Standalone game scripts (simple hackers, casino)
  lib/                  Infrastructure (utils, ports, launcher, config, react shim)
  types/                Shared types and port assignments (zero RAM)
  views/                Dashboard UI (React, two-tier tabs, error boundaries)
  workers/              Stateless hack/grow/weaken/share executors (.js, minimal RAM)
  tools/                CLI utilities and debug helpers
```

## Development

```bash
npm install
npm run watch        # Transpile + sync to game
```

Build output goes to `dist/`, which `bitburner-filesync` pushes to the game.
