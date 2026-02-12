/**
 * Wire Cutting Solver
 *
 * The game displays colored wires in a CSS grid and instructions to cut specific
 * wires by number or color. Press number keys 1-9 to cut.
 *
 * DOM structure (from WireCuttingGame.tsx):
 *   Paper > h4 "Cut the wires..."
 *         > p  "Cut wires number 3."
 *         > p  "Cut all wires colored YELLOW."
 *         > Box (div, CSS grid, repeat(N, 1fr))
 *             > p (wire label "1", styled with theme.primary)
 *             > p (wire label "2", ...)
 *             > ... (N labels)
 *             > p (wire segment "|R|", style.color = "red")
 *             > p (wire segment "|B|", style.color = "blue")
 *             > ... (11 rows × N segments)
 *
 * Wire colors: red, blue, white, #FFC107 (yellow).
 * Instructions alternate: position-based ("Cut wires number N.")
 *                         color-based ("Cut all wires colored COLOR.")
 *
 * Cutting a wrong wire = instant failure.
 * Timer expires = failure.
 */
import { MiniGameSolver } from "/lib/infiltration/types";
import { DomUtils } from "/lib/dom";

const win = globalThis["window"] as Window;

function normalizeColor(cssColor: string): string {
  const c = cssColor.toLowerCase().trim();
  if (c.includes("255") && c.includes("193")) return "YELLOW"; // rgb(255, 193, 7)
  if (c === "red" || (c.includes("255") && c.includes(", 0, 0"))) return "RED";
  if (c === "blue" || (c.includes("0, 0") && c.includes("255)"))) return "BLUE";
  if (c === "white" || c.includes("255, 255, 255")) return "WHITE";
  if (c.includes("ffc107") || c.includes("yellow")) return "YELLOW";
  if (c === "#ff0000") return "RED";
  if (c === "#0000ff") return "BLUE";
  if (c === "#ffffff") return "WHITE";
  return c.toUpperCase();
}

/** Find the grid container using getComputedStyle (MUI sx sets styles via CSS classes). */
function findGrid(container: Element): { el: Element; width: number } | null {
  const divs = container.querySelectorAll("div");
  for (const div of divs) {
    const computed = win.getComputedStyle(div);
    const cols = computed.gridTemplateColumns;
    if (!cols || cols === "none") continue;
    // gridTemplateColumns is like "60px 60px 60px 60px" — count the values
    const colCount = cols.split(/\s+/).filter(s => s.length > 0).length;
    if (colCount >= 4) {
      return { el: div, width: colCount };
    }
  }
  return null;
}

export const wireCuttingSolver: MiniGameSolver = {
  id: "wire-cutting",
  name: "Wire Cutting",

  detect(doc: Document): boolean {
    const container = doc.querySelector(".MuiContainer-root");
    if (!container) return false;
    const papers = container.querySelectorAll(":scope > .MuiPaper-root");
    const game = papers[papers.length - 1];
    if (!game) return false;

    const h4 = game.querySelector("h4");
    return h4?.textContent?.toLowerCase().includes("cut the wires") ?? false;
  },

  async solve(doc: Document, dom: DomUtils): Promise<void> {
    const container = dom.getGameContainer();
    if (!container) throw new Error("WireCutting: game container not found");

    // 1. Parse instructions from <p> elements
    const paragraphs = container.querySelectorAll("p");
    const instructions: string[] = [];
    for (const p of paragraphs) {
      const text = p.textContent?.trim() ?? "";
      if (text.toLowerCase().startsWith("cut ")) {
        instructions.push(text);
      }
    }

    // 2. Find the wire grid and determine wire count
    const grid = findGrid(container);
    if (!grid) throw new Error("WireCutting: could not find wire grid");
    const wireCount = grid.width;

    // 3. Read ALL wire colors from segment rows (skip the N label elements)
    // Grid children: [label1..labelN, seg1_row0..segN_row0, seg1_row1..segN_row1, ...]
    // Wires can have 2 colors (15% chance). Colors cycle per row: wire.colors[row % colors.length].
    // Read rows 0 and 1 to catch both colors of dual-color wires.
    const children = Array.from(grid.el.children) as HTMLElement[];
    const wireColorSets = new Map<number, Set<string>>(); // wire number (1-based) → set of color names

    const ROWS_TO_CHECK = 2; // rows 0 and 1 are enough to find both colors
    for (let row = 0; row < ROWS_TO_CHECK; row++) {
      for (let i = 0; i < wireCount; i++) {
        const segmentIndex = wireCount + (row * wireCount) + i;
        if (segmentIndex >= children.length) break;
        const seg = children[segmentIndex];
        const color = seg.style?.color || win.getComputedStyle(seg).color;
        if (color) {
          const normalized = normalizeColor(color);
          if (!wireColorSets.has(i + 1)) wireColorSets.set(i + 1, new Set());
          wireColorSets.get(i + 1)!.add(normalized);
        }
      }
    }

    // 4. Determine which wires to cut (union of all matching instructions)
    const wiresToCut = new Set<number>();

    for (const instruction of instructions) {
      // Position-based: "Cut wires number 3."
      const numMatch = instruction.match(/number\s+([\d\s,and]+)/i);
      if (numMatch) {
        const nums = numMatch[1].match(/\d+/g);
        if (nums) {
          for (const n of nums) wiresToCut.add(parseInt(n));
        }
        continue;
      }

      // Color-based: "Cut all wires colored YELLOW."
      // A wire matches if ANY of its colors match (dual-color wires have 2 entries)
      const colorMatch = instruction.match(/colored?\s+(\w+)/i);
      if (colorMatch) {
        const targetColor = colorMatch[1].toUpperCase();
        for (const [wireNum, colors] of wireColorSets) {
          if (colors.has(targetColor)) {
            wiresToCut.add(wireNum);
          }
        }
      }
    }

    if (wiresToCut.size === 0) {
      throw new Error(
        `WireCutting: no wires to cut. Instructions: [${instructions.join(" | ")}], ` +
        `Colors: ${JSON.stringify(Object.fromEntries([...wireColorSets].map(([k, v]) => [k, [...v]])))}`,
      );
    }

    // 5. Press number keys to cut wires
    for (const wireNum of wiresToCut) {
      dom.pressKey(String(wireNum));
      await dom.sleep(50);
    }
  },
};
