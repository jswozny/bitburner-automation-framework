/**
 * Infiltration Navigation
 *
 * Helpers for navigating the Bitburner UI to start/complete infiltrations.
 * Uses DOM manipulation to click through menus and select rewards.
 *
 * Bitburner uses Material-UI (MUI) components. Buttons can be:
 *   <button class="MuiButton-root ...">  (standard MUI Button)
 *   <button class="MuiButtonBase-root ...">  (ButtonBase)
 *   Elements with role="button"
 * The textContent of MUI buttons includes nested span text.
 */
import { DomUtils } from "/lib/dom";

const doc = globalThis["document"] as Document;

/**
 * Find any clickable element whose text includes the given substring.
 * Searches broadly: button, [role="button"], a, span, p, div, li, Typography elements.
 * Returns the most specific (deepest) match to avoid clicking a parent container.
 */
function findClickableByText(
  substring: string,
  exact = false,
): Element | null {
  const lower = substring.toLowerCase();
  const candidates: Element[] = [];

  // Broad selector covering all likely interactive elements
  const allElements = doc.querySelectorAll(
    'button, [role="button"], a, span, p, div, li, h1, h2, h3, h4, h5, h6',
  );

  for (const el of allElements) {
    const text = el.textContent?.trim().toLowerCase() ?? "";
    const match = exact ? text === lower : text.includes(lower);
    if (match) {
      candidates.push(el);
    }
  }

  if (candidates.length === 0) return null;

  // Prefer the deepest match (most specific element)
  // Sort by depth descending, then prefer <button> elements
  candidates.sort((a, b) => {
    const depthA = getDepth(a);
    const depthB = getDepth(b);
    if (depthA !== depthB) return depthB - depthA;
    // Prefer buttons
    if (a.tagName === "BUTTON" && b.tagName !== "BUTTON") return -1;
    if (b.tagName === "BUTTON" && a.tagName !== "BUTTON") return 1;
    return 0;
  });

  return candidates[0];
}

function getDepth(el: Element): number {
  let depth = 0;
  let current: Element | null = el;
  while (current) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

/**
 * Find the closest ancestor that is a button or has an onClick handler.
 * This handles cases where we match a <span> inside a <button>.
 */
function findClickableAncestor(el: Element): Element {
  let current: Element | null = el;
  while (current) {
    if (current.tagName === "BUTTON") return current;
    if (current.getAttribute("role") === "button") return current;
    // Check for React onClick via internal props
    const key = Object.keys(current).find(k => k.startsWith("__reactProps$"));
    if (key) {
      const props = (current as unknown as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
      if (props?.onClick) return current;
    }
    current = current.parentElement;
  }
  return el;
}

/** Navigate to the city view by clicking the City tab in the sidebar. */
export async function navigateToCity(dom: DomUtils): Promise<void> {
  // The sidebar uses MUI list items. Try multiple strategies.

  // Strategy 1: Find sidebar list items with "City" text
  const sidebarSelectors = [
    '.MuiDrawer-root [role="button"]',
    '.MuiDrawer-root li',
    '.MuiDrawer-root a',
    '.MuiList-root [role="button"]',
    '.MuiList-root li',
    'nav [role="button"]',
    'nav li',
    'nav a',
  ];

  for (const selector of sidebarSelectors) {
    const items = doc.querySelectorAll(selector);
    for (const item of items) {
      const text = item.textContent?.trim().toLowerCase() ?? "";
      if (text === "city") {
        dom.clickTrusted(findClickableAncestor(item));
        await dom.sleep(300);
        return;
      }
    }
  }

  // Strategy 2: Broad search for any element that says "City"
  // Filter to likely sidebar elements (not main content)
  const allEls = doc.querySelectorAll('*');
  for (const el of allEls) {
    if (el.children.length > 0) continue; // Only leaf nodes
    const text = el.textContent?.trim();
    if (text === "City" || text === "city") {
      const ancestor = findClickableAncestor(el);
      dom.clickTrusted(ancestor);
      await dom.sleep(300);
      return;
    }
  }

  throw new Error("Navigation: could not find City tab in sidebar");
}

/** Navigate to a company in the city view. */
export async function navigateToCompany(dom: DomUtils, companyName: string): Promise<void> {
  await dom.sleep(500); // Wait for city view to render

  // Strategy 1: aria-label (city map locations use this)
  const ariaEl = doc.querySelector(`[aria-label="${companyName}"]`);
  if (ariaEl) {
    dom.clickTrusted(findClickableAncestor(ariaEl));
    await dom.sleep(500);
    return;
  }

  // Strategy 2: Text content match — broad search
  const el = findClickableByText(companyName, true);
  if (el) {
    dom.clickTrusted(findClickableAncestor(el));
    await dom.sleep(500);
    return;
  }

  // Strategy 3: Partial match (company name might be displayed differently)
  const partialEl = findClickableByText(companyName, false);
  if (partialEl) {
    dom.clickTrusted(findClickableAncestor(partialEl));
    await dom.sleep(500);
    return;
  }

  throw new Error(`Navigation: could not find company "${companyName}" in city view`);
}

/** Click the "Infiltrate Company" button. Must bypass isTrusted check. */
export async function clickInfiltrateButton(dom: DomUtils): Promise<void> {
  await dom.sleep(300);

  // Strategy 1: Find a <button> element whose text contains "Infiltrate"
  // This is the most reliable — buttons have React onClick props directly
  const buttons = doc.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent?.trim().toLowerCase() ?? "";
    if (text.includes("infiltrate")) {
      dom.clickTrusted(btn);
      await dom.sleep(500);
      return;
    }
  }

  // Strategy 2: Find any element with "infiltrate" text and walk to clickable ancestor
  const el = findClickableByText("infiltrate");
  if (el) {
    const clickTarget = findClickableAncestor(el);
    dom.clickTrusted(clickTarget);
    await dom.sleep(500);
    return;
  }

  // Strategy 3: Broad search for "Infiltrate Company" exact text
  const allEls = doc.querySelectorAll("*");
  for (const candidate of allEls) {
    const text = candidate.textContent?.trim().toLowerCase() ?? "";
    if (text === "infiltrate company") {
      dom.clickTrusted(findClickableAncestor(candidate));
      await dom.sleep(500);
      return;
    }
  }

  // Collect diagnostic info for error message
  const buttonTexts: string[] = [];
  for (const btn of buttons) {
    buttonTexts.push(btn.textContent?.trim() ?? "(empty)");
  }

  throw new Error(
    `Navigation: could not find Infiltrate button. ` +
    `Found ${buttons.length} <button> elements: [${buttonTexts.slice(0, 10).join(", ")}]`
  );
}

/** Click the "Start" button on the infiltration intro screen. */
export async function clickStartButton(dom: DomUtils): Promise<void> {
  await dom.sleep(300);

  const el = findClickableByText("start", true);
  if (el) {
    dom.clickTrusted(findClickableAncestor(el));
    await dom.sleep(500);
    return;
  }

  // Broader: any button-like element containing "start"
  const elBroad = findClickableByText("start");
  if (elBroad) {
    dom.clickTrusted(findClickableAncestor(elBroad));
    await dom.sleep(500);
    return;
  }

  throw new Error("Navigation: could not find Start button");
}

/** Find a <button> whose textContent starts with the given prefix (case-insensitive). */
function findButtonByPrefix(prefix: string): HTMLButtonElement | null {
  const lower = prefix.toLowerCase();
  const buttons = doc.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent?.trim().toLowerCase() ?? "";
    if (text.startsWith(lower)) return btn;
  }
  return null;
}

/** Select a reward on the victory screen. */
export async function selectReward(
  dom: DomUtils,
  rewardType: "faction-rep" | "money",
  factionName?: string,
): Promise<void> {
  await dom.sleep(300);

  if (rewardType === "faction-rep" && factionName) {
    // IMPORTANT: Select the faction from the dropdown BEFORE clicking Trade.
    // The Trade button fires immediately with whatever the dropdown currently shows.
    await selectFactionForReward(dom, factionName);

    // Now find and click the "Trade for ... reputation" button
    const tradeBtn = findButtonByPrefix("trade for");
    if (tradeBtn) {
      dom.clickTrusted(tradeBtn);
      await dom.sleep(300);
      return;
    }

    // Fallback: broader search
    const tradeEl = findClickableByText("trade for");
    if (tradeEl) {
      dom.clickTrusted(findClickableAncestor(tradeEl));
      await dom.sleep(300);
      return;
    }
  }

  // Sell for money — find the "Sell for $..." button
  const sellBtn = findButtonByPrefix("sell for");
  if (sellBtn) {
    dom.clickTrusted(sellBtn);
    await dom.sleep(300);
    return;
  }

  // Fallback: broader search
  const sellEl = findClickableByText("sell for");
  if (sellEl) {
    dom.clickTrusted(findClickableAncestor(sellEl));
    await dom.sleep(300);
    return;
  }

  // Last resort: Quit
  const quitEl = findClickableByText("quit");
  if (quitEl) {
    dom.clickTrusted(findClickableAncestor(quitEl));
    await dom.sleep(300);
    return;
  }

  throw new Error("Navigation: could not find reward selection buttons");
}

/** Select a specific faction in the reward selection dropdown (MUI Select). */
async function selectFactionForReward(dom: DomUtils, factionName: string): Promise<void> {
  await dom.sleep(200);

  // MUI Select opens its dropdown on mousedown, NOT click.
  // We need to dispatch a mousedown event to open the portal dropdown,
  // then find and click the matching MenuItem.
  const selects = doc.querySelectorAll('.MuiSelect-select, [role="combobox"], .MuiSelect-root');
  if (selects.length === 0) return; // No dropdown found — proceed anyway

  for (const sel of selects) {
    // Check if already showing the right faction
    if (sel.textContent?.includes(factionName)) return;

    // Open dropdown with mousedown (what MUI Select listens for)
    sel.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await dom.sleep(300);

    // MUI renders the dropdown in a portal (outside the Select's DOM tree).
    // Look for MenuItems in the whole document.
    const options = doc.querySelectorAll('li[role="option"], .MuiMenuItem-root');
    let found = false;
    for (const opt of options) {
      if (opt.textContent?.includes(factionName)) {
        // MenuItems respond to React onClick — use clickTrusted
        dom.clickTrusted(opt);
        found = true;
        break;
      }
    }

    // Wait for React state update so the Trade button uses the new faction
    await dom.sleep(500);

    if (found) {
      // Verify: re-check the Select's displayed text
      const newText = sel.textContent ?? "";
      if (newText.includes(factionName)) return; // Success
      // If text didn't change, the click may not have registered — continue to next Select
    }

    // Close any open dropdown before trying the next Select element
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await dom.sleep(200);
  }

  // If we get here, faction selection may have failed — proceed anyway, caller will click Trade/Sell
}

/** Check if we're on the infiltration intro screen. */
export function isOnIntroScreen(): boolean {
  const allHeaders = doc.querySelectorAll("h4, h5, h6");
  for (const h of allHeaders) {
    if (h.textContent?.toLowerCase().includes("infiltrating")) return true;
  }
  return false;
}

/** Check if we're on the victory screen. */
export function isOnVictoryScreen(): boolean {
  const allHeaders = doc.querySelectorAll("h4, h5, h6");
  for (const h of allHeaders) {
    if (h.textContent?.toLowerCase().includes("infiltration successful")) return true;
  }
  return false;
}

/** Check if we're on the countdown screen. */
export function isOnCountdown(): boolean {
  const allHeaders = doc.querySelectorAll("h4, h5, h6");
  for (const h of allHeaders) {
    if (h.textContent?.toLowerCase().includes("get ready")) return true;
  }
  return false;
}

/** Check if any mini-game is active (MuiContainer with game papers). */
export function isInGame(): boolean {
  const container = doc.querySelector(".MuiContainer-root");
  if (!container) return false;
  const papers = container.querySelectorAll(":scope > .MuiPaper-root");
  return papers.length >= 2;
}

/** Check if the player got killed/failed and is back at the terminal/city. */
export function isGameOver(): boolean {
  return !doc.querySelector(".MuiContainer-root") && !isOnIntroScreen();
}
