/**
 * Cyberpunk / Symbol Matching Solver
 *
 * Navigate a grid of 2-char hex symbols to match targets in order.
 * Press Space to select the current cell. Wrong selection = instant failure.
 *
 * DOM structure (from Cyberpunk2077Game.tsx):
 *   Paper > h4 "Match the symbols!"
 *         > h5 "Targets: "
 *             > span (current target, color=infolight) "A3 "
 *             > span (next target, color=primary) "FF "
 *             > ...
 *         > br
 *         > Box (div, CSS grid, repeat(W, 1fr), gap 1)
 *             > p (cell, fontSize 2em) "A3"
 *             > p (cell) "FF"
 *             > ... (W * H cells, row-major)
 *
 * Selected cell: border 2px solid infolight, padding 2px.
 * Non-selected: border unset, padding 4px.
 * Cursor starts at (0,0). Navigation wraps around.
 * Symbols: 2-char hex pairs from [0-9A-F].
 */
import { MiniGameSolver } from "/lib/infiltration/types";
import { DomUtils } from "/lib/dom";

const win = globalThis["window"] as Window;

/** Find the grid container using getComputedStyle. */
function findGrid(container: Element): { el: Element; width: number } | null {
  const divs = container.querySelectorAll("div");
  for (const div of divs) {
    const computed = win.getComputedStyle(div);
    const cols = computed.gridTemplateColumns;
    if (!cols || cols === "none") continue;
    const colCount = cols.split(/\s+/).filter(s => s.length > 0).length;
    if (colCount >= 3 && colCount <= 6) {
      return { el: div, width: colCount };
    }
  }
  return null;
}

/** Find the currently selected cell index by checking for border style. */
function findSelectedIndex(cells: Element[]): number {
  for (let i = 0; i < cells.length; i++) {
    const el = cells[i] as HTMLElement;
    // Selected cell has border: "2px solid <color>" via inline style
    // Check inline style first (MUI sx with conditional applies inline for dynamic values)
    const inlineB = el.style?.border || el.style?.borderStyle;
    if (inlineB && inlineB.includes("solid")) return i;
    // Check computed style
    const computed = win.getComputedStyle(el);
    const borderWidth = computed.borderWidth || computed.borderTopWidth;
    if (borderWidth && borderWidth !== "0px" && parseFloat(borderWidth) > 0) {
      // Verify it has a visible border (not just default)
      const padding = parseFloat(computed.paddingTop || "0");
      // Selected cells have 2px padding, non-selected have 4px
      if (padding <= 3) return i;
    }
  }
  return 0; // Default to top-left
}

export const cyberpunkSolver: MiniGameSolver = {
  id: "cyberpunk",
  name: "Match Symbols",

  detect(doc: Document): boolean {
    const container = doc.querySelector(".MuiContainer-root");
    if (!container) return false;
    const papers = container.querySelectorAll(":scope > .MuiPaper-root");
    const game = papers[papers.length - 1];
    if (!game) return false;

    const h4 = game.querySelector("h4");
    return h4?.textContent?.toLowerCase().includes("match the symbols") ?? false;
  },

  async solve(doc: Document, dom: DomUtils): Promise<void> {
    const container = dom.getGameContainer();
    if (!container) throw new Error("Cyberpunk: game container not found");

    // 1. Read target symbols from h5 spans
    const targets: string[] = [];
    const h5s = container.querySelectorAll("h5");
    for (const h5 of h5s) {
      const text = h5.textContent ?? "";
      if (!text.toLowerCase().includes("target")) continue;
      const spans = h5.querySelectorAll("span");
      for (const span of spans) {
        const sym = span.textContent?.trim();
        // Symbols are 2-char hex pairs
        if (sym && sym.length === 2 && /^[0-9A-F]{2}$/i.test(sym)) {
          targets.push(sym.toUpperCase());
        }
      }
      // Fallback: parse text directly if no spans found
      if (targets.length === 0) {
        const parts = text.replace(/Targets?:?\s*/i, "").trim().split(/\s+/);
        for (const p of parts) {
          const trimmed = p.replace(/\u00a0/g, "").trim(); // remove &nbsp;
          if (trimmed.length === 2 && /^[0-9A-F]{2}$/i.test(trimmed)) {
            targets.push(trimmed.toUpperCase());
          }
        }
      }
    }

    if (targets.length === 0) throw new Error("Cyberpunk: could not find target symbols");

    // 2. Find the grid
    const grid = findGrid(container);
    if (!grid) throw new Error("Cyberpunk: could not find grid");
    const { width } = grid;

    // 3. Read grid cell values
    const cells = Array.from(grid.el.children);
    const gridValues: string[] = cells.map(c => (c.textContent?.trim() ?? "").toUpperCase());
    // 4. Find current cursor position
    const curIdx = findSelectedIndex(cells);
    let curRow = Math.floor(curIdx / width);
    let curCol = curIdx % width;

    // 5. Navigate to each target in order
    for (const target of targets) {
      // Find the target in the grid
      const targetIdx = gridValues.indexOf(target);
      if (targetIdx === -1) {
        throw new Error(`Cyberpunk: target "${target}" not found in grid [${gridValues.join(", ")}]`);
      }

      const targetRow = Math.floor(targetIdx / width);
      const targetCol = targetIdx % width;

      // Move vertically
      while (curRow !== targetRow) {
        if (targetRow > curRow) {
          dom.pressKey("ArrowDown");
          curRow++;
        } else {
          dom.pressKey("ArrowUp");
          curRow--;
        }
        await dom.sleep(15);
      }

      // Move horizontally
      while (curCol !== targetCol) {
        if (targetCol > curCol) {
          dom.pressKey("ArrowRight");
          curCol++;
        } else {
          dom.pressKey("ArrowLeft");
          curCol--;
        }
        await dom.sleep(15);
      }

      // Select this cell
      dom.pressKey(" ");
      await dom.sleep(50);
    }
  },
};
