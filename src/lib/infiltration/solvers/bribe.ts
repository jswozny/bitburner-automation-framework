/**
 * Bribe Solver
 *
 * Scroll through words and select the positive one.
 *
 * Detection: h4 contains "Say something nice about the guard".
 */
import { MiniGameSolver } from "/lib/infiltration/types";
import { DomUtils } from "/lib/dom";

const POSITIVE_WORDS = new Set([
  "affectionate", "agreeable", "bright", "charming", "creative",
  "determined", "energetic", "friendly", "funny", "generous",
  "polite", "likable", "diplomatic", "helpful", "giving",
  "kind", "hardworking", "patient", "dynamic", "loyal",
  "straightforward",
]);

export const bribeSolver: MiniGameSolver = {
  id: "bribe",
  name: "Bribe",

  detect(doc: Document): boolean {
    const container = doc.querySelector(".MuiContainer-root");
    if (!container) return false;
    const papers = container.querySelectorAll(":scope > .MuiPaper-root");
    const game = papers[papers.length - 1];
    if (!game) return false;

    const h4 = game.querySelector("h4");
    return h4?.textContent?.toLowerCase().includes("say something nice") ?? false;
  },

  async solve(doc: Document, dom: DomUtils): Promise<void> {
    const maxCycles = 50;

    for (let i = 0; i < maxCycles; i++) {
      const container = dom.getGameContainer();
      if (!container) throw new Error("Bribe: game container disappeared");

      // The current word is displayed in an h5 element (the middle one)
      const h5s = container.querySelectorAll("h5");
      // Typically: h5[0] = up arrow, h5[1] = current word, h5[2] = down arrow
      for (const h5 of h5s) {
        const word = h5.textContent?.trim().toLowerCase() ?? "";
        if (POSITIVE_WORDS.has(word)) {
          dom.pressKey(" ");
          return;
        }
      }

      // Scroll down to next word
      dom.pressKey("w");
      await dom.sleep(30);
    }

    throw new Error("Bribe: exhausted word cycle without finding positive word");
  },
};
