/**
 * Install Augmentations Action
 *
 * One-shot script to install purchased augmentations and soft-reset.
 * WARNING: This resets the game! Only run when ready.
 * Target RAM: ~82 GB at SF4.1 (installAugmentations = 1 Singularity function)
 *
 * Usage: run actions/install-augments.js
 *        run actions/install-augments.js --confirm
 */
import { NS } from "@ns";

export const MANUAL_COMMAND = 'ns.singularity.installAugmentations("start.js")';

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["confirm", false],
    ["script", "start.js"],
  ]) as { confirm: boolean; script: string; _: string[] };

  if (!flags.confirm) {
    ns.tprint("WARNING: This will install augmentations and SOFT RESET the game!");
    ns.tprint("  To confirm, run: run actions/install-augments.js --confirm");
    ns.tprint(`  Start script: ${flags.script}`);
    return;
  }

  ns.tprint(`Installing augmentations... Restarting with ${flags.script}`);
  ns.singularity.installAugmentations(flags.script);
}
