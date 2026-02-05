# Bitburner Scripts

Automation framework for [Bitburner](https://danielyxie.github.io/bitburner/). Requires SF4 (Singularity) for most features.

## Quick Start

```
run start.js
```

Launches the dashboard, core daemons (nuke, hack, queue), and optional daemons (pserv, share) if RAM permits. Safe to re-run -- skips anything already running.

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

Started by `start.js` or launched manually. All publish status to ports for the dashboard.

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

## Tools

| Tool | Purpose |
|------|---------|
| `tools/prioritize.js` | Analyze game state, suggest next action |
| `tools/launch.js SCRIPT` | RAM-aware launcher (kills workers if needed) |
| `tools/nmap.js` | Network map |
| `tools/path-to.js HOST` | Show connect path to a server |
| `tools/pwned.js` | List rooted servers |
| `tools/slum-work.js` | Quick crime runner |
| `tools/debug/peek-ports.js` | Inspect status port data |
| `tools/debug/ram-audit.js` | RAM cost audit of all scripts |
| `tools/debug/file-diff.js` | Find orphaned/missing files on server |

## Project Structure

```
src/
  start.ts              Entry point
  actions/              One-shot scripts (buy, travel, install, etc.)
  controllers/          Business logic (no main loops)
  daemons/              Long-running services with status publishing
  scripts/              Standalone game scripts (simple hackers, casino)
  lib/                  Infrastructure (utils, ports, launcher, react shim)
  types/                Shared types and port assignments (zero RAM)
  views/                Dashboard UI (React)
  workers/              Stateless hack/grow/weaken/share executors
  tools/                CLI utilities and debug helpers
```

## Development

```bash
npm install
npm run watch        # Transpile + sync to game
```

Build output goes to `dist/`, which `bitburner-filesync` pushes to the game.
