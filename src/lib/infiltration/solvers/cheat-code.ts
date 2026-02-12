/**
 * Cheat Code Solver
 *
 * Read the arrow sequence and press the matching arrow keys.
 *
 * Detection: h4 contains "Enter the Code!".
 */
import { MiniGameSolver } from "/lib/infiltration/types";
import { DomUtils } from "/lib/dom";

const ARROW_MAP: Record<string, string> = {
  "\u2191": "ArrowUp",     // ↑
  "\u2193": "ArrowDown",   // ↓
  "\u2190": "ArrowLeft",   // ←
  "\u2192": "ArrowRight",  // →
};

export const cheatCodeSolver: MiniGameSolver = {
  id: "cheat-code",
  name: "Cheat Code",

  detect(doc: Document): boolean {
    const container = doc.querySelector(".MuiContainer-root");
    if (!container) return false;
    const papers = container.querySelectorAll(":scope > .MuiPaper-root");
    const game = papers[papers.length - 1];
    if (!game) return false;

    const h4 = game.querySelector("h4");
    return h4?.textContent?.toLowerCase().includes("enter the code") ?? false;
  },

  async solve(doc: Document, dom: DomUtils): Promise<void> {
    const maxSteps = 15;

    for (let step = 0; step < maxSteps; step++) {
      const container = dom.getGameContainer();
      if (!container) throw new Error("CheatCode: game container disappeared");

      // Find the arrow display. The arrows are in spans within an h4 element.
      // The current arrow to press is at full opacity, future arrows are at 0.4 opacity.
      const h4s = container.querySelectorAll("h4");
      let found = false;

      for (const h4 of h4s) {
        const spans = h4.querySelectorAll("span");
        for (const span of spans) {
          const opacity = (span as HTMLElement).style?.opacity;
          const text = span.textContent?.trim() ?? "";
          // Find the first fully opaque arrow (current one to press)
          if (text in ARROW_MAP && opacity !== "0.4" && opacity !== "0") {
            dom.pressKey(ARROW_MAP[text]);
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        // Try text-based approach: read the full h4 text, find known arrows
        for (const h4 of h4s) {
          const text = h4.textContent ?? "";
          for (const char of text) {
            if (char in ARROW_MAP) {
              dom.pressKey(ARROW_MAP[char]);
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }

      if (!found) return; // No more arrows = done or game ended

      await dom.sleep(50);
    }
  },
};
