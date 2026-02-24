/**
 * Start University Course Action
 *
 * One-shot script to start a university course.
 * Target RAM: ~34 GB at SF4.1 (universityCourse = 1 Singularity function)
 *
 * Usage: run actions/start-university.js --uni "ZB Institute of Technology" --course "Algorithms"
 *        run actions/start-university.js --course Algorithms
 *        (defaults to ZB Institute of Technology if not specified)
 */
import { NS } from "@ns";

export const MANUAL_COMMAND = 'ns.singularity.universityCourse("ZB Institute of Technology", "Algorithms", false)';

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
 if (!ns.getResetInfo().ownedSF.has(4)) {
  ns.tprint("ERROR: SF4.1 is required to start university courses. You do not have SF4.1 unlocked.");
  return;
 }
  const flags = ns.flags([
    ["uni", "ZB Institute of Technology"],
    ["course", "Algorithms"],
    ["focus", false],
  ]) as { uni: string; course: string; focus: boolean; _: string[] };

  const uni = flags.uni;
  const course = flags.course;
  const focus = flags.focus;

  // Validate course
  const validCourses = ["Computer Science", "Data Structures", "Networks", "Algorithms", "Management", "Leadership"];
  if (!validCourses.includes(course)) {
    ns.tprint(`ERROR: Invalid course "${course}". Valid: ${validCourses.join(", ")}`);
    return;
  }

  const success = ns.singularity.universityCourse(uni, course as "Computer Science" | "Data Structures" | "Networks" | "Algorithms" | "Management" | "Leadership", focus);

  if (success) {
    ns.tprint(`SUCCESS: Started ${course} at ${uni}${focus ? " (focused)" : ""}`);
  } else {
    const player = ns.getPlayer();
    ns.tprint(`FAILED: Could not start course at ${uni}. Current city: ${player.city}`);
    ns.tprint(`  You may need to travel first: run actions/travel.js --city Volhaven`);
  }
}
