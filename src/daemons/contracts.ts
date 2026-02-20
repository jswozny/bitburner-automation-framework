/**
 * Coding Contracts Daemon
 *
 * Scans rooted servers for .cct files, solves them using the solver library,
 * and publishes ContractsStatus to port 18.
 *
 * Usage: run daemons/contracts.js
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import { peekStatus, publishStatus } from "/lib/ports";
import { writeDefaultConfig, getConfigNumber, getConfigBool } from "/lib/config";
import {
  STATUS_PORTS,
  NukeStatus,
  ContractResult,
  PendingContract,
  ContractsStatus,
} from "/types/ports";
import { solve, SOLVERS } from "/lib/contracts";

const C = COLORS;

// RAM budget: ls(0.2) + getContractType(5) + getData(5) + attempt(10) + getNumTriesRemaining(2) + overhead
/** @ram 32 */
export function main(ns: NS): Promise<void> {
  ns.ramOverride(32);
  return daemon(ns);
}

// === STATE ===

let totalSolved = 0;
let totalFailed = 0;
const recentResults: ContractResult[] = [];
const MAX_RECENT = 20;
const attemptedThisCycle = new Set<string>();

async function daemon(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  writeDefaultConfig(ns, "contracts", {
    "interval": "60000",
    "oneShot": "false",
    "minTries": "2",
  });

  const interval = getConfigNumber(ns, "contracts", "interval", 60000);
  const oneShot = getConfigBool(ns, "contracts", "oneShot", false);
  const minTries = getConfigNumber(ns, "contracts", "minTries", 2);

  const knownTypes = Object.keys(SOLVERS).length;

  ns.print(`${C.cyan}Contracts daemon started${C.reset} (interval: ${interval}ms, minTries: ${minTries})`);
  ns.print(`${C.cyan}Solvers loaded: ${knownTypes}${C.reset}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const scanStart = Date.now();

    // Get server list from nuke status port
    const nukeStatus = peekStatus<NukeStatus>(ns, STATUS_PORTS.nuke);
    const servers = nukeStatus ? [...nukeStatus.rooted] : ["home"];
    if (!servers.includes("home")) servers.unshift("home");

    const pendingContracts: PendingContract[] = [];
    let found = 0;
    let skipped = 0;

    for (const host of servers) {
      const files = ns.ls(host, ".cct");
      for (const file of files) {
        found++;
        const key = `${host}:${file}`;

        // Skip already attempted this session
        if (attemptedThisCycle.has(key)) continue;

        const type = ns.codingcontract.getContractType(file, host);
        const tries = ns.codingcontract.getNumTriesRemaining(file, host);

        // Check if we have a solver
        if (!SOLVERS[type]) {
          pendingContracts.push({ host, file, type, triesRemaining: tries, reason: "no solver" });
          skipped++;
          continue;
        }

        // Check minimum tries
        if (tries < minTries) {
          pendingContracts.push({ host, file, type, triesRemaining: tries, reason: "low tries" });
          skipped++;
          continue;
        }

        // Attempt to solve
        const data = ns.codingcontract.getData(file, host);
        const result = solve(type, data);

        if (!result.solved) {
          pendingContracts.push({ host, file, type, triesRemaining: tries, reason: "solver error" });
          skipped++;
          ns.print(`  ${C.yellow}SKIP${C.reset} ${type} on ${host} — solver returned no answer`);
          continue;
        }

        // Submit answer
        const reward = ns.codingcontract.attempt(result.answer, file, host);
        attemptedThisCycle.add(key);

        if (reward) {
          totalSolved++;
          const entry: ContractResult = {
            host, file, type,
            reward: String(reward),
            success: true,
            timestamp: Date.now(),
          };
          recentResults.unshift(entry);
          ns.print(`  ${C.green}SOLVED${C.reset} ${type} on ${host} — ${reward}`);
        } else {
          totalFailed++;
          const entry: ContractResult = {
            host, file, type,
            reward: "",
            success: false,
            timestamp: Date.now(),
          };
          recentResults.unshift(entry);
          ns.print(`  ${C.red}FAILED${C.reset} ${type} on ${host}`);
        }

        // Cap recent results
        while (recentResults.length > MAX_RECENT) recentResults.pop();
      }
    }

    const status: ContractsStatus = {
      solved: totalSolved,
      failed: totalFailed,
      skipped,
      found,
      pendingContracts,
      recentResults: [...recentResults],
      knownTypes,
      totalTypes: 28,
      lastScanTime: Date.now() - scanStart,
      serversScanned: servers.length,
    };

    publishStatus(ns, STATUS_PORTS.contracts, status);

    ns.print("");
    ns.print(
      `${C.cyan}=== Contracts Scan ===${C.reset} ` +
      `${servers.length} servers, ${found} contracts, ` +
      `${C.green}${totalSolved} solved${C.reset}, ` +
      `${C.red}${totalFailed} failed${C.reset}, ` +
      `${skipped} skipped ` +
      `(${Date.now() - scanStart}ms)`
    );

    if (oneShot) break;
    await ns.sleep(interval);
  }
}
