/**
 * Crime analysis utilities for Bitburner
 *
 * Import with: import { CRIMES, analyzeCrime, ... } from '/controllers/crime';
 */
import { NS } from "@ns";

// === CRIME TYPES ===

export const CRIMES = [
  "Shoplift",
  "Rob Store",
  "Mug",
  "Larceny",
  "Deal Drugs",
  "Bond Forgery",
  "Traffick Arms",
  "Homicide",
  "Grand Theft Auto",
  "Kidnap",
  "Assassination",
  "Heist",
] as const;

export type CrimeName = (typeof CRIMES)[number];

// === CRIME STATS ===

export interface CrimeAnalysis {
  crime: CrimeName;
  chance: number;
  timeSec: number;
  money: number;
  moneyPerMin: number;
  hackExpPerMin: number;
  strExpPerMin: number;
  defExpPerMin: number;
  dexExpPerMin: number;
  agiExpPerMin: number;
  chaExpPerMin: number;
  karmaPerMin: number;
  killsPerMin: number;
}

/**
 * Analyze a single crime and return expected values per minute
 */
export function analyzeCrime(ns: NS, crime: CrimeName): CrimeAnalysis {
  const stats = ns.singularity.getCrimeStats(crime);
  const chance = ns.singularity.getCrimeChance(crime);

  const timeMs = stats.time;
  const timeSec = timeMs / 1000;
  const attemptsPerMin = 60 / timeSec;

  return {
    crime,
    chance,
    timeSec,
    money: stats.money,
    moneyPerMin: chance * stats.money * attemptsPerMin,
    hackExpPerMin: chance * stats.hacking_exp * attemptsPerMin,
    strExpPerMin: chance * stats.strength_exp * attemptsPerMin,
    defExpPerMin: chance * stats.defense_exp * attemptsPerMin,
    dexExpPerMin: chance * stats.dexterity_exp * attemptsPerMin,
    agiExpPerMin: chance * stats.agility_exp * attemptsPerMin,
    chaExpPerMin: chance * stats.charisma_exp * attemptsPerMin,
    karmaPerMin: chance * stats.karma * attemptsPerMin,
    killsPerMin: chance * stats.kills * attemptsPerMin,
  };
}

/**
 * Analyze all crimes and return sorted by a given key (descending)
 */
export function analyzeAllCrimes(
  ns: NS,
  sortBy: keyof CrimeAnalysis = "moneyPerMin"
): CrimeAnalysis[] {
  const analyses = CRIMES.map((crime) => analyzeCrime(ns, crime));
  return analyses.sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return bVal - aVal;
    }
    return 0;
  });
}

/**
 * Find the best crime for a specific goal
 */
export function findBestCrime(
  ns: NS,
  goal: keyof CrimeAnalysis = "moneyPerMin"
): CrimeAnalysis {
  return analyzeAllCrimes(ns, goal)[0];
}

// === FORMATTING UTILITIES ===

export function fmtMoney(n: number): string {
  if (!isFinite(n)) return "-";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}t`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}m`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}k`;
  return `${sign}${abs.toFixed(0)}`;
}

export function fmtExp(n: number): string {
  if (!isFinite(n) || n === 0) return "-";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(1);
}

export function fmtPercent(n: number): string {
  return (n * 100).toFixed(1) + "%";
}