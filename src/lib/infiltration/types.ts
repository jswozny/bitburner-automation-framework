/**
 * Infiltration-Specific Types
 *
 * Solver interface, config types, and internal state types used by
 * the infiltration daemon and its solvers. Zero NS imports.
 */
import { DomUtils } from "/lib/dom";

export interface MiniGameSolver {
  id: string;
  name: string;
  detect(doc: Document): boolean;
  solve(doc: Document, domUtils: DomUtils): Promise<void>;
}

export interface InfiltrationConfig {
  targetCompanyOverride?: string;
  enabledSolvers: Set<string>;
  rewardStaleThresholdMs: number;
  logBufferSize: number;
}

export const DEFAULT_CONFIG: InfiltrationConfig = {
  enabledSolvers: new Set(),
  rewardStaleThresholdMs: 60_000,
  logBufferSize: 100,
};
