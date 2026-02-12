/**
 * Brackets Solver
 *
 * Read the open brackets and type the matching closing brackets in reverse order.
 *
 * Detection: h4 contains "Close the brackets".
 */
import { MiniGameSolver } from "/lib/infiltration/types";
import { DomUtils } from "/lib/dom";

const BRACKET_MAP: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
};

export const bracketsSolver: MiniGameSolver = {
  id: "brackets",
  name: "Close the Brackets",

  detect(doc: Document): boolean {
    const container = doc.querySelector(".MuiContainer-root");
    if (!container) return false;
    const papers = container.querySelectorAll(":scope > .MuiPaper-root");
    const game = papers[papers.length - 1];
    if (!game) return false;

    const h4 = game.querySelector("h4");
    return h4?.textContent?.toLowerCase().includes("close the brackets") ?? false;
  },

  async solve(doc: Document, dom: DomUtils): Promise<void> {
    const container = dom.getGameContainer();
    if (!container) throw new Error("Brackets: game container not found");

    // The brackets are shown in a large Typography element (typically with fontSize ~5em)
    // Contains the left (open) brackets + any already-typed right brackets
    const paragraphs = container.querySelectorAll("p");
    let bracketText = "";

    for (const p of paragraphs) {
      const text = p.textContent?.trim() ?? "";
      // The bracket display has opening bracket chars
      if (text && /^[(\[{<)\]}>]+$/.test(text)) {
        bracketText = text;
        break;
      }
    }

    if (!bracketText) throw new Error("Brackets: could not find bracket text");

    // Extract only the opening brackets (chars that are in BRACKET_MAP keys)
    const openBrackets: string[] = [];
    for (const ch of bracketText) {
      if (ch in BRACKET_MAP) {
        openBrackets.push(ch);
      }
    }

    // Type closing brackets in reverse order
    for (let i = openBrackets.length - 1; i >= 0; i--) {
      const closingBracket = BRACKET_MAP[openBrackets[i]];
      dom.pressKey(closingBracket);
      await dom.sleep(10);
    }
  },
};
