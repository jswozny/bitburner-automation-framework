/**
 * Backward String Solver
 *
 * Read the displayed string and type it character by character.
 * The string is displayed with CSS scaleX(-1) (mirrored), but textContent
 * returns the original un-mirrored text which IS what needs to be typed.
 *
 * Detection: h4 contains "Type it backward" or "Type it".
 */
import { MiniGameSolver } from "/lib/infiltration/types";
import { DomUtils } from "/lib/dom";

export const backwardStringSolver: MiniGameSolver = {
  id: "backward-string",
  name: "Backward String",

  detect(doc: Document): boolean {
    const container = doc.querySelector(".MuiContainer-root");
    if (!container) return false;
    const papers = container.querySelectorAll(":scope > .MuiPaper-root");
    const game = papers[papers.length - 1];
    if (!game) return false;

    const h4 = game.querySelector("h4");
    const text = h4?.textContent?.toLowerCase() ?? "";
    return text.includes("type it backward") || text === "type it";
  },

  async solve(doc: Document, dom: DomUtils): Promise<void> {
    const container = dom.getGameContainer();
    if (!container) throw new Error("BackwardString: game container not found");

    // The answer text is in a Typography element after the h4 header.
    // It's displayed with scaleX(-1) but textContent gives the raw string.
    const paragraphs = container.querySelectorAll("p");
    let answer = "";

    for (const p of paragraphs) {
      const style = (p as HTMLElement).style;
      // The flipped text has transform: scaleX(-1)
      if (style.transform?.includes("scaleX(-1)") ||
          (p.parentElement as HTMLElement)?.style?.transform?.includes("scaleX(-1)")) {
        answer = p.textContent ?? "";
        break;
      }
    }

    // Fallback: find any large text element that isn't the header
    if (!answer) {
      const allText = container.querySelectorAll("h4, h5, p");
      for (const el of allText) {
        const text = el.textContent?.trim() ?? "";
        if (text && !text.toLowerCase().includes("type it") && text.length > 1) {
          answer = text;
          break;
        }
      }
    }

    if (!answer) throw new Error("BackwardString: could not find answer text");

    // Type each character (game uses event.key.toUpperCase())
    for (const char of answer) {
      dom.pressKey(char);
      await dom.sleep(10);
    }
  },
};
