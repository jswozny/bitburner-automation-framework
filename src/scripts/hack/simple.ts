/**
 * Simple single-target weaken/grow/hack loop
 *
 * A basic script that runs weaken, grow, or hack on a single target
 * based on the server's current state.
 *
 * Run: run hack/simple.js n00dles
 *      run hack/simple.js n00dles --one-shot
 *      run hack/simple.js n00dles --money-threshold 0.9
 */
import { NS } from "@ns";
import { HackAction } from "/lib/utils";

// === TYPES ===

export interface SimpleConfig {
  oneShot: boolean;
  moneyThreshold: number;
  securityThreshold: number;
}

export interface SimpleCycleResult {
  target: string;
  action: HackAction;
  result: number;
}

// === CORE LOGIC ===

/**
 * Run one weaken/grow/hack cycle on a target
 */
export async function runSimpleCycle(
  ns: NS,
  target: string,
  config: SimpleConfig
): Promise<SimpleCycleResult> {
  const moneyThresh = ns.getServerMaxMoney(target) * config.moneyThreshold;
  const securityThresh = ns.getServerMinSecurityLevel(target) * config.securityThreshold;

  let action: HackAction;
  let result: number;

  if (ns.getServerSecurityLevel(target) > securityThresh) {
    action = "weaken";
    result = await ns.weaken(target);
  } else if (ns.getServerMoneyAvailable(target) < moneyThresh) {
    action = "grow";
    result = await ns.grow(target);
  } else {
    action = "hack";
    result = await ns.hack(target);
  }

  return { target, action, result };
}

// === RUNNER ===

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ["one-shot", false],
    ["money-threshold", 0.8],
    ["security-threshold", 1.1],
  ]) as {
    "one-shot": boolean;
    "money-threshold": number;
    "security-threshold": number;
    _: string[];
  };

  const target = flags._[0] as string;

  if (!target) {
    ns.tprint("ERROR: No target specified. Usage: run hack/simple.js <target>");
    return;
  }

  const config: SimpleConfig = {
    oneShot: flags["one-shot"],
    moneyThreshold: flags["money-threshold"],
    securityThreshold: flags["security-threshold"],
  };

  do {
    await runSimpleCycle(ns, target, config);
  } while (!config.oneShot);
}
