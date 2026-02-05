/**
 * File Diff Debug Tool
 *
 * Compares .js files expected from the dist build to files actually on the
 * home server. Finds orphaned files (on server but not in dist) and
 * missing files (in dist but not on server). Can optionally delete orphans.
 *
 * Skips: /cache/*, /data/*, *.msg, *.exe on root, *.txt files.
 * Only compares .js files.
 *
 * Usage:
 *   run tools/debug/file-diff.js              # Show diff
 *   run tools/debug/file-diff.js --delete     # Delete orphaned .js files
 */
import { NS } from "@ns";

/** Folders to skip — these are runtime data, not distributed code. */
const SKIP_PREFIXES = [
  "cache/",
  "data/",
];

/**
 * Get all .js files on the home server, excluding skipped folders
 * and non-.js files.
 */
function getServerFiles(ns: NS): string[] {
  const allFiles = ns.ls("home");
  return allFiles.filter(f => {
    // Only .js files
    if (!f.endsWith(".js")) return false;

    // Skip files in excluded folders
    for (const prefix of SKIP_PREFIXES) {
      if (f.startsWith(prefix)) return false;
    }

    return true;
  });
}

/**
 * Get the expected .js file list from the auto-generated manifest.
 * The manifest is produced by build/gen-manifest.js and placed at
 * /data/expected-files.txt during the build process.
 */
function getExpectedFiles(ns: NS): string[] {
  const raw = ns.read("/data/expected-files.txt");
  if (!raw || raw === "NULL PORT DATA") {
    ns.tprint("ERROR: /data/expected-files.txt not found. Run build first.");
    return [];
  }
  return raw.trim().split("\n").filter(f => f.length > 0);
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["delete", false],
  ]) as { delete: boolean; _: string[] };

  const doDelete = flags.delete;

  const serverFiles = new Set(getServerFiles(ns));
  const expectedFiles = new Set(getExpectedFiles(ns));

  // Files on server but NOT in expected list (orphans)
  const orphans = [...serverFiles].filter(f => !expectedFiles.has(f)).sort();

  // Files in expected list but NOT on server (missing)
  const missing = [...expectedFiles].filter(f => !serverFiles.has(f)).sort();

  // Files present in both (matched)
  const matched = [...expectedFiles].filter(f => serverFiles.has(f));

  ns.tprint(`\n\x1b[36m=== FILE DIFF: dist vs home server ===\x1b[0m`);
  ns.tprint(`  \x1b[2mExpected:\x1b[0m ${expectedFiles.size} files`);
  ns.tprint(`  \x1b[2mOn server:\x1b[0m ${serverFiles.size} .js files`);
  ns.tprint(`  \x1b[32mMatched:\x1b[0m  ${matched.length}`);
  ns.tprint(`  \x1b[31mOrphans:\x1b[0m  ${orphans.length} (on server, not in dist)`);
  ns.tprint(`  \x1b[33mMissing:\x1b[0m  ${missing.length} (in dist, not on server)`);

  if (orphans.length > 0) {
    ns.tprint(`\n  \x1b[31m--- Orphaned files (not in dist) ---\x1b[0m`);
    for (const f of orphans) {
      ns.tprint(`    \x1b[31m-\x1b[0m ${f}`);
    }

    if (doDelete) {
      ns.tprint(`\n  \x1b[33mDeleting ${orphans.length} orphaned file(s)...\x1b[0m`);
      let deleted = 0;
      let failed = 0;
      for (const f of orphans) {
        const success = ns.rm(f, "home");
        if (success) {
          deleted++;
          ns.tprint(`    \x1b[32mDeleted:\x1b[0m ${f}`);
        } else {
          failed++;
          ns.tprint(`    \x1b[31mFailed:\x1b[0m  ${f}`);
        }
      }
      ns.tprint(`\n  Deleted: ${deleted}, Failed: ${failed}`);
    } else {
      ns.tprint(`\n  \x1b[2mRun with --delete to remove orphaned files\x1b[0m`);
    }
  }

  if (missing.length > 0) {
    ns.tprint(`\n  \x1b[33m--- Missing files (in dist, not on server) ---\x1b[0m`);
    for (const f of missing) {
      ns.tprint(`    \x1b[33m+\x1b[0m ${f}`);
    }
    ns.tprint(`\n  \x1b[2mThese should appear after file sync pushes them.\x1b[0m`);
  }

  if (orphans.length === 0 && missing.length === 0) {
    ns.tprint(`\n  \x1b[32mAll files match! No orphans, no missing files.\x1b[0m`);
  }

  ns.tprint("");
}
