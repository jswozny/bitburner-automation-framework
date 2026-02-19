/**
 * Config Reader/Writer
 *
 * Key-value config stored at /config/{system}.txt.
 * Format: key=value, # comments, blank lines ignored.
 * Uses ns.read() + ns.write() only (minimal RAM: ~0 extra).
 *
 * Import with: import { readConfig, getConfigString, ... } from "/lib/config";
 */
import { NS } from "@ns";

/**
 * Read a config file and return all key-value pairs.
 * Lines starting with # are comments. Blank lines are skipped.
 * Keys and values are split on the first = sign.
 */
export function readConfig(ns: NS, system: string): Map<string, string> {
  const config = new Map<string, string>();
  const raw = ns.read(`/config/${system}.txt`);
  if (!raw) return config;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) config.set(key, value);
  }

  return config;
}

/**
 * Write default config if the file doesn't exist yet.
 * Never overwrites an existing config file.
 */
export function writeDefaultConfig(
  ns: NS,
  system: string,
  defaults: Record<string, string>,
): void {
  const existing = ns.read(`/config/${system}.txt`);
  if (existing) return; // File exists, don't overwrite

  const lines: string[] = [`# ${system} Config`];
  for (const [key, value] of Object.entries(defaults)) {
    lines.push(`${key}=${value}`);
  }

  ns.write(`/config/${system}.txt`, lines.join("\n"), "w");
}

/**
 * Get a string config value, falling back to the provided default.
 */
export function getConfigString(
  ns: NS,
  system: string,
  key: string,
  fallback: string,
): string {
  const config = readConfig(ns, system);
  return config.get(key) ?? fallback;
}

/**
 * Get a numeric config value, falling back to the provided default.
 */
export function getConfigNumber(
  ns: NS,
  system: string,
  key: string,
  fallback: number,
): number {
  const config = readConfig(ns, system);
  const raw = config.get(key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Get a boolean config value, falling back to the provided default.
 * "true" and "1" are truthy, everything else is false.
 */
export function getConfigBool(
  ns: NS,
  system: string,
  key: string,
  fallback: boolean,
): boolean {
  const config = readConfig(ns, system);
  const raw = config.get(key);
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}
