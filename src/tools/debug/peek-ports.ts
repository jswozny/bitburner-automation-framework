/**
 * Port Peek Debug Tool
 *
 * Peek at status port contents for debugging.
 * If a port number is passed, shows the full JSON for that port.
 * If no port is passed, shows a few lines from each status port.
 *
 * Usage:
 *   run tools/debug/peek-ports.js           # Summary of all ports
 *   run tools/debug/peek-ports.js 2         # Full contents of port 2 (hack)
 *   run tools/debug/peek-ports.js 19        # Queue port
 */
import { NS } from "@ns";
import {
  STATUS_PORTS,
  INFILTRATION_CONTROL_PORT,
  GANG_CONTROL_PORT,
  QUEUE_PORT,
  COMMAND_PORT,
} from "/types/ports";

const PORT_NAMES: Record<number, string> = {
  // Build from STATUS_PORTS (the source of truth)
  ...Object.fromEntries(
    Object.entries(STATUS_PORTS).map(([name, port]) => [port, name]),
  ),
  // Control / special ports
  [INFILTRATION_CONTROL_PORT]: "infiltration-ctrl",
  [GANG_CONTROL_PORT]: "gang-ctrl",
  [QUEUE_PORT]: "queue",
  [COMMAND_PORT]: "command",
};

function peekRaw(ns: NS, port: number): string | null {
  const handle = ns.getPortHandle(port);
  if (handle.empty()) return null;
  const raw = handle.peek();
  if (raw === "NULL PORT DATA") return null;
  return String(raw);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.substring(0, max) + "...";
}

function printPortDetail(ns: NS, port: number): void {
  const name = PORT_NAMES[port] || `port-${port}`;
  const raw = peekRaw(ns, port);

  ns.tprint(`\n\x1b[36m=== Port ${port} (${name}) ===\x1b[0m`);

  if (raw === null) {
    ns.tprint("  \x1b[2m(empty)\x1b[0m");
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const pretty = JSON.stringify(parsed, null, 2);
    const lines = pretty.split("\n");
    for (const line of lines) {
      ns.tprint("  " + line);
    }
    ns.tprint(`\n  \x1b[2mSize: ${raw.length} chars\x1b[0m`);
  } catch {
    ns.tprint("  (raw) " + raw);
  }
}

function printPortSummary(ns: NS, port: number): void {
  const name = PORT_NAMES[port] || `port-${port}`;
  const raw = peekRaw(ns, port);

  if (raw === null) {
    ns.tprint(`  \x1b[2m[${String(port).padStart(2)}] ${name.padEnd(18)} (empty)\x1b[0m`);
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed);
    const preview = truncate(JSON.stringify(parsed), 120);
    ns.tprint(`  \x1b[32m[${String(port).padStart(2)}]\x1b[0m ${name.padEnd(18)} \x1b[2m${keys.length} keys, ${raw.length} chars\x1b[0m`);
    ns.tprint(`       ${preview}`);
  } catch {
    ns.tprint(`  \x1b[32m[${String(port).padStart(2)}]\x1b[0m ${name.padEnd(18)} \x1b[2m${raw.length} chars (not JSON)\x1b[0m`);
    ns.tprint(`       ${truncate(raw, 120)}`);
  }
}

export async function main(ns: NS): Promise<void> {
  const args = ns.args;

  if (args.length > 0) {
    const port = Number(args[0]);
    if (isNaN(port) || port < 1 || port > 20) {
      ns.tprint("ERROR: Port must be a number between 1 and 20");
      return;
    }
    printPortDetail(ns, port);
    return;
  }

  // Summary of all status ports (derived from STATUS_PORTS)
  ns.tprint(`\n\x1b[36m=== STATUS PORTS ===\x1b[0m`);

  const statusPortNums = Object.values(STATUS_PORTS).sort((a, b) => a - b);
  for (const port of statusPortNums) {
    printPortSummary(ns, port);
  }

  ns.tprint("");
  ns.tprint(`  \x1b[36m--- Control / Special Ports ---\x1b[0m`);
  printPortSummary(ns, INFILTRATION_CONTROL_PORT);
  printPortSummary(ns, GANG_CONTROL_PORT);
  printPortSummary(ns, QUEUE_PORT);
  printPortSummary(ns, COMMAND_PORT);
  ns.tprint("");
}
