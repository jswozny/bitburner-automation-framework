/**
 * Solver Registry
 *
 * All registered solvers and the detectAndSolve dispatch function.
 */
import { MiniGameSolver } from "/lib/infiltration/types";
import { DomUtils } from "/lib/dom";
import { slashSolver } from "/lib/infiltration/solvers/slash";
import { backwardStringSolver } from "/lib/infiltration/solvers/backward-string";
import { bracketsSolver } from "/lib/infiltration/solvers/brackets";
import { bribeSolver } from "/lib/infiltration/solvers/bribe";
import { cheatCodeSolver } from "/lib/infiltration/solvers/cheat-code";
import { cyberpunkSolver } from "/lib/infiltration/solvers/cyberpunk";
import { minesweeperSolver } from "/lib/infiltration/solvers/minesweeper";
import { wireCuttingSolver } from "/lib/infiltration/solvers/wire-cutting";
import { rememberingSolver } from "/lib/infiltration/solvers/remembering";

export const SOLVERS: MiniGameSolver[] = [
  slashSolver,
  backwardStringSolver,
  bracketsSolver,
  bribeSolver,
  cheatCodeSolver,
  cyberpunkSolver,
  minesweeperSolver,
  wireCuttingSolver,
  rememberingSolver,
];

/**
 * Detect which mini-game is currently displayed and solve it.
 * Returns the solver ID that matched.
 * Throws if no solver matches or if the matched solver fails.
 */
export async function detectAndSolve(
  doc: Document,
  domUtils: DomUtils,
  enabledSolvers: Set<string>,
): Promise<string> {
  for (const solver of SOLVERS) {
    if (!enabledSolvers.has(solver.id)) continue;

    if (solver.detect(doc)) {
      await solver.solve(doc, domUtils);
      return solver.id;
    }
  }

  throw new Error("No solver matched the current mini-game");
}
