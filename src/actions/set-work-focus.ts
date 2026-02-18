/**
 * Set Work Focus Action
 *
 * Writes work focus configuration to /data/work-config.json.
 * Does NOT use any Singularity functions — always works regardless of RAM.
 * Target RAM: ~2 GB (no Singularity)
 *
 * Usage: run actions/set-work-focus.js --focus strength
 *        run actions/set-work-focus.js --focus balance-combat
 *        run actions/set-work-focus.js --focus crime-money
 */
import { NS } from "@ns";

export const MANUAL_COMMAND = 'N/A (config-only, no Singularity)';

const VALID_FOCUSES = [
  "strength", "defense", "dexterity", "agility",
  "hacking", "charisma",
  "balance-all", "balance-combat",
  "crime-money", "crime-stats",
  "crime-karma", "crime-kills",
] as const;

const WORK_CONFIG_PATH = "/data/work-config.json";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["focus", ""],
  ]) as { focus: string; _: string[] };

  const focus = flags.focus || (flags._.length > 0 ? String(flags._[0]) : "");

  if (!focus) {
    ns.tprint("ERROR: No focus specified.");
    ns.tprint(`  Valid: ${VALID_FOCUSES.join(", ")}`);
    ns.tprint("  Usage: run actions/set-work-focus.js --focus strength");
    return;
  }

  if (!(VALID_FOCUSES as readonly string[]).includes(focus)) {
    ns.tprint(`ERROR: Invalid focus "${focus}".`);
    ns.tprint(`  Valid: ${VALID_FOCUSES.join(", ")}`);
    return;
  }

  // Read existing config, merge, write
  let config: Record<string, unknown> = {};
  try {
    const raw = ns.read(WORK_CONFIG_PATH);
    if (raw) {
      config = JSON.parse(raw);
    }
  } catch { /* start fresh */ }

  config.focus = focus;

  ns.write(WORK_CONFIG_PATH, JSON.stringify(config, null, 2), "w");
  ns.tprint(`SUCCESS: Work focus set to "${focus}"`);
}
