/**
 * Slash Solver
 *
 * Wait for the guard to be "Distracted!" then press Space.
 * Detection: h4 contains "Guarding", "Distracted!", or "Alerted!"
 * or h5 contains "sentinel drops his guard".
 */
import { MiniGameSolver } from "/lib/infiltration/types";
import { DomUtils } from "/lib/dom";

export const slashSolver: MiniGameSolver = {
  id: "slash",
  name: "Slash",

  detect(doc: Document): boolean {
    const container = doc.querySelector(".MuiContainer-root");
    if (!container) return false;
    const papers = container.querySelectorAll(":scope > .MuiPaper-root");
    const game = papers[papers.length - 1];
    if (!game) return false;

    // Check h5 for sentinel text
    const h5s = game.querySelectorAll("h5");
    for (const h5 of h5s) {
      const text = h5.textContent?.toLowerCase() ?? "";
      if (text.includes("sentinel") || text.includes("guard") && text.includes("distracted")) {
        return true;
      }
    }

    // Check h4 for phase indicators
    const h4s = game.querySelectorAll("h4");
    for (const h4 of h4s) {
      const text = h4.textContent?.toLowerCase() ?? "";
      if (text.includes("guarding") || text === "distracted!" || text === "alerted!") {
        return true;
      }
    }

    return false;
  },

  async solve(doc: Document, dom: DomUtils): Promise<void> {
    // Wait for "Distracted!" to appear in an h4
    const pollInterval = 25;
    const maxWait = 6000;
    let waited = 0;

    while (waited < maxWait) {
      const container = dom.getGameContainer();
      if (!container) throw new Error("Slash: game container disappeared");

      const h4s = container.querySelectorAll("h4");
      for (const h4 of h4s) {
        if (h4.textContent?.trim() === "Distracted!") {
          // Small delay to avoid race condition
          await dom.sleep(50);
          dom.pressKey(" ");
          return;
        }
      }

      await dom.sleep(pollInterval);
      waited += pollInterval;
    }

    throw new Error("Slash: timed out waiting for Distracted! state");
  },
};
