/**
 * Start Gym Workout Action
 *
 * One-shot script to start a gym workout.
 * Target RAM: ~34 GB at SF4.1 (gymWorkout = 1 Singularity function)
 *
 * Usage: run actions/start-gym.js --gym "Powerhouse Gym" --stat str
 *        run actions/start-gym.js --stat str
 *        (defaults to Powerhouse Gym if not specified)
 */
import { NS } from "@ns";

export const MANUAL_COMMAND = 'ns.singularity.gymWorkout("Powerhouse Gym", "str", false)';

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
 if (!ns.getResetInfo().ownedSF.has(4)) {
  ns.tprint("ERROR: SF4.1 is required to start gym workouts. You do not have SF4.1 unlocked.");
  return;
 }
  const flags = ns.flags([
    ["gym", "Powerhouse Gym"],
    ["stat", "str"],
    ["focus", false],
  ]) as { gym: string; stat: string; focus: boolean; _: string[] };

  const gym = flags.gym;
  const stat = flags.stat;
  const focus = flags.focus;

  // Validate stat
  const validStats = ["str", "def", "dex", "agi"];
  if (!validStats.includes(stat)) {
    ns.tprint(`ERROR: Invalid stat "${stat}". Valid: ${validStats.join(", ")}`);
    return;
  }

  const success = ns.singularity.gymWorkout(gym, stat as "str" | "def" | "dex" | "agi", focus);

  if (success) {
    ns.tprint(`SUCCESS: Started ${stat} workout at ${gym}${focus ? " (focused)" : ""}`);
  } else {
    const player = ns.getPlayer();
    ns.tprint(`FAILED: Could not start gym workout at ${gym}. Current city: ${player.city}`);
    ns.tprint(`  You may need to travel first: run actions/travel.js --city Sector-12`);
  }
}
