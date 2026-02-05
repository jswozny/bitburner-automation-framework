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

const PORT_NAMES: Record<number, string> = {
  1: "nuke",
  2: "hack",
  3: "pserv",
  4: "share",
  5: "rep",
  6: "work",
  7: "darkweb",
  8: "bitnode",
  19: "queue",
  20: "command",
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
    ns.tprint(`  \x1b[2m[${String(port).padStart(2)}] ${name.padEnd(8)} (empty)\x1b[0m`);
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed);
    const preview = truncate(JSON.stringify(parsed), 120);
    ns.tprint(`  \x1b[32m[${String(port).padStart(2)}]\x1b[0m ${name.padEnd(8)} \x1b[2m${keys.length} keys, ${raw.length} chars\x1b[0m`);
    ns.tprint(`       ${preview}`);
  } catch {
    ns.tprint(`  \x1b[32m[${String(port).padStart(2)}]\x1b[0m ${name.padEnd(8)} \x1b[2m${raw.length} chars (not JSON)\x1b[0m`);
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

  // Summary of all status ports
  ns.tprint(`\n\x1b[36m=== PORT STATUS ===\x1b[0m`);

  const statusPorts = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const port of statusPorts) {
    printPortSummary(ns, port);
  }

  ns.tprint("");
  ns.tprint(`  \x1b[36m--- Special Ports ---\x1b[0m`);
  printPortSummary(ns, 19);
  printPortSummary(ns, 20);
  ns.tprint("");
}
