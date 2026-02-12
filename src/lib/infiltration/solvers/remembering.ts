/**
 * Remembering / Cheat Code solver redirect
 *
 * Note: The original spec called this "Remembering" but in the actual game
 * there's no separate "remembering" mini-game. The Minesweeper game has
 * a memory component. This file exists for backward compatibility with the
 * spec's solver list, but delegates to the cheat-code solver pattern since
 * "Enter the Code!" involves remembering a sequence.
 *
 * This is actually a no-op placeholder — the cheat-code and minesweeper
 * solvers handle all memory-based games.
 */
import { MiniGameSolver } from "/lib/infiltration/types";
import { DomUtils } from "/lib/dom";

export const rememberingSolver: MiniGameSolver = {
  id: "remembering",
  name: "Remembering",

  detect(_doc: Document): boolean {
    // This solver never matches on its own — minesweeper and cheat-code
    // handle all "remembering" style games. It exists only so the solver
    // registry has the expected ID from the spec.
    return false;
  },

  async solve(_doc: Document, _dom: DomUtils): Promise<void> {
    throw new Error("Remembering: should not be called directly");
  },
};
