/**
 * Pserv Daemon
 *
 * Long-running daemon that purchases and upgrades personal servers,
 * then publishes PservStatus to the status port for the dashboard.
 *
 * Usage:
 *   run daemons/pserv.js
 *   run daemons/pserv.js --one-shot
 *   run daemons/pserv.js --min-ram 64
 *   run daemons/pserv.js --reserve 1000000
 *   run daemons/pserv.js --interval 5000
 */
import { NS } from "@ns";
import { COLORS } from "/lib/utils";
import { getPservStatus, PservConfig, PservCallbacks, runPservCycle } from "/controllers/pserv";
import { publishStatus } from "/lib/ports";
import { STATUS_PORTS, PservStatus } from "/types/ports";
import { writeDefaultConfig, getConfigString, getConfigNumber, getConfigBool } from "/lib/config";
import { requestBudget, notifyPurchase, getBudgetAllocation } from "/lib/budget";
import { estimateServerROI } from "/controllers/budget";

/**
 * Build a PservStatus object with formatted values for the dashboard.
 * Bridges raw controller data to the port type expected by the UI.
 */
function computePservStatus(ns: NS, reserve: number, autoBuy: boolean): PservStatus {
  const raw = getPservStatus(ns);
  const maxPossibleRam = ns.getPurchasedServerMaxRam();

  // Map servers to formatted entries
  const servers = raw.servers.map((hostname) => {
    const ram = ns.getServerMaxRam(hostname);
    return {
      hostname,
      ram,
      ramFormatted: ns.formatRam(ram),
    };
  });

  // Count how many servers are at max RAM
  const maxedCount = servers.filter((s) => s.ram >= maxPossibleRam).length;

  // Upgrade progress: percentage of servers at max
  const upgradeProgress =
    raw.serverCount > 0
      ? `${maxedCount}/${raw.serverCount} (${((maxedCount / raw.serverCount) * 100).toFixed(0)}%)`
      : "0/0";

  // Find next upgrade: locate smallest server and check if we can afford its next tier
  let nextUpgrade: PservStatus["nextUpgrade"] = null;
  if (raw.serverCount > 0 && !raw.allMaxed) {
    const smallest = servers.reduce((min, s) => (s.ram < min.ram ? s : min));
    if (smallest.ram < maxPossibleRam) {
      const nextRam = smallest.ram * 2;
      const cost = ns.getPurchasedServerUpgradeCost(smallest.hostname, nextRam);
      const budget = ns.getServerMoneyAvailable("home") - reserve;

      nextUpgrade = {
        hostname: smallest.hostname,
        currentRam: ns.formatRam(smallest.ram),
        nextRam: ns.formatRam(nextRam),
        cost,
        costFormatted: ns.formatNumber(cost),
        canAfford: cost <= budget,
      };
    }
  }

  return {
    serverCount: raw.serverCount,
    serverCap: raw.serverCap,
    totalRam: ns.formatRam(raw.totalRam),
    minRam: ns.formatRam(raw.minRam),
    maxRam: ns.formatRam(raw.maxRam),
    maxPossibleRam: ns.formatRam(maxPossibleRam),
    maxPossibleRamNum: maxPossibleRam,
    allMaxed: raw.allMaxed,
    autoBuy,
    servers,
    upgradeProgress,
    nextUpgrade,
  };
}

/**
 * Print formatted pserv status to the script log.
 */
function printStatus(ns: NS, status: PservStatus, bought: number, upgraded: number): void {
  const C = COLORS;

  ns.print(`${C.cyan}═══ Pserv Daemon ═══${C.reset}`);
  if (!status.autoBuy) {
    ns.print(`${C.yellow}MONITOR ONLY — auto-buy disabled${C.reset}`);
  }
  ns.print(
    `${C.dim}Servers: ${status.serverCount}/${status.serverCap} | Total RAM: ${status.totalRam}${C.reset}`,
  );
  ns.print("");

  if (status.serverCount > 0) {
    ns.print(
      `${C.white}Range: ${status.minRam} - ${status.maxRam} (max: ${status.maxPossibleRam})${C.reset}`,
    );
    ns.print(`${C.white}Maxed: ${status.upgradeProgress}${C.reset}`);

    if (status.allMaxed) {
      ns.print(`${C.green}All servers at maximum RAM!${C.reset}`);
    } else if (status.nextUpgrade) {
      const u = status.nextUpgrade;
      if (u.canAfford) {
        ns.print(
          `${C.green}Next: ${u.hostname} ${u.currentRam} -> ${u.nextRam} (${u.costFormatted})${C.reset}`,
        );
      } else {
        ns.print(
          `${C.yellow}Next: ${u.hostname} ${u.currentRam} -> ${u.nextRam} (need ${u.costFormatted})${C.reset}`,
        );
      }
    }
  }

  ns.print("");
  ns.print(`${C.dim}This cycle: ${bought} bought, ${upgraded} upgraded${C.reset}`);
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  writeDefaultConfig(ns, "pserv", {
    prefix: "pserv",
    minRam: "8",
    reserve: "0",
    oneShot: "false",
    interval: "10000",
    autoBuy: "true",
  });

  do {
    const config: PservConfig = {
      prefix: getConfigString(ns, "pserv", "prefix", "pserv"),
      minRam: getConfigNumber(ns, "pserv", "minRam", 8),
      reserve: getConfigNumber(ns, "pserv", "reserve", 0),
      oneShot: getConfigBool(ns, "pserv", "oneShot", false),
      interval: getConfigNumber(ns, "pserv", "interval", 10000),
      autoBuy: getConfigBool(ns, "pserv", "autoBuy", true),
    };
    ns.clearLog();

    // Budget integration: constrain spending by allocation if daemon is running
    const budgetFn = (): number => {
      const alloc = getBudgetAllocation(ns, "servers");
      const raw = ns.getServerMoneyAvailable("home") - config.reserve;
      if (alloc === null) return raw; // No budget daemon → unlimited
      return Math.min(raw, alloc.allocated);
    };
    const onPurchase = (cost: number, desc: string): void => {
      notifyPurchase(ns, "servers", cost, desc);
    };

    // Request budget for the next expected purchase
    const pstat = getPservStatus(ns);
    if (pstat.serverCount < pstat.serverCap) {
      const minCost = ns.getPurchasedServerCost(config.minRam);
      const roi = estimateServerROI(0, config.minRam, 0);
      requestBudget(ns, "servers", minCost, `new server @ ${ns.formatRam(config.minRam)}`, roi);
    } else if (!pstat.allMaxed && pstat.servers.length > 0) {
      const smallest = pstat.servers.reduce((m, h) => ns.getServerMaxRam(h) < ns.getServerMaxRam(m) ? h : m);
      const smallestRam = ns.getServerMaxRam(smallest);
      const nextRam = smallestRam * 2;
      if (nextRam <= pstat.maxPossibleRam) {
        const cost = ns.getPurchasedServerUpgradeCost(smallest, nextRam);
        const roi = estimateServerROI(smallestRam, nextRam, 0);
        requestBudget(ns, "servers", cost, `upgrade ${smallest} → ${ns.formatRam(nextRam)}`, roi);
      }
    }

    const callbacks: PservCallbacks = { budgetFn, onPurchase };

    // Run the purchase/upgrade cycle (or skip if monitor-only)
    const result = config.autoBuy
      ? await runPservCycle(ns, config, callbacks)
      : { bought: 0, upgraded: 0, waitingFor: null };

    // Compute formatted status for the dashboard
    const pservStatus = computePservStatus(ns, config.reserve, config.autoBuy);

    // Publish to port for dashboard consumption
    publishStatus(ns, STATUS_PORTS.pserv, pservStatus);

    // Print terminal lines
    printStatus(ns, pservStatus, result.bought, result.upgraded);

    // Auto-exit when all servers are purchased and maxed
    if (pservStatus.allMaxed && pservStatus.serverCount >= pservStatus.serverCap) {
      ns.tprint("INFO: All personal servers purchased and maxed. Pserv daemon exiting.");
      return;
    }

    if (!config.oneShot) {
      ns.print(
        `\n${COLORS.dim}Next check in ${config.interval / 1000}s...${COLORS.reset}`,
      );
      await ns.sleep(config.interval);
    }
  } while (!getConfigBool(ns, "pserv", "oneShot", false));
}
