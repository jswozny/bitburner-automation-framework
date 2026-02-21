/**
 * Casino Blackjack Library
 *
 * DOM interaction, game state detection, React fiber state access,
 * perfect-information strategy for automated blackjack.
 *
 * Zero NS imports — pure DOM/browser APIs. Reuses DomUtils from lib/dom.
 */
import { DomUtils } from "/lib/dom";

const doc = globalThis["document"] as Document;

// === LOCAL DOM HELPERS ===

/** Find any clickable element whose text includes the given substring. */
function findClickableByText(substring: string, exact = false): Element | null {
  const lower = substring.toLowerCase();
  const candidates: Element[] = [];

  const allElements = doc.querySelectorAll(
    'button, [role="button"], a, span, p, div, li, h1, h2, h3, h4, h5, h6',
  );

  for (const el of allElements) {
    const text = el.textContent?.trim().toLowerCase() ?? "";
    const match = exact ? text === lower : text.includes(lower);
    if (match) candidates.push(el);
  }

  if (candidates.length === 0) return null;

  // Prefer deepest match, then prefer <button> elements
  candidates.sort((a, b) => {
    const depthA = getDepth(a);
    const depthB = getDepth(b);
    if (depthA !== depthB) return depthB - depthA;
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

/** Walk up to find nearest button or element with React onClick handler. */
function findClickableAncestor(el: Element): Element {
  let current: Element | null = el;
  while (current) {
    if (current.tagName === "BUTTON") return current;
    if (current.getAttribute("role") === "button") return current;
    const key = Object.keys(current).find(k => k.startsWith("__reactProps$"));
    if (key) {
      const props = (current as unknown as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
      if (props?.onClick) return current;
    }
    current = current.parentElement;
  }
  return el;
}

/** Find a <button> whose textContent matches (case-insensitive, trimmed). */
function findButtonByText(text: string): HTMLButtonElement | null {
  const lower = text.toLowerCase();
  const buttons = doc.querySelectorAll("button");
  for (const btn of buttons) {
    const btnText = btn.textContent?.trim().toLowerCase() ?? "";
    if (btnText === lower) return btn;
  }
  return null;
}

// === NAVIGATION ===

/** Navigate to City tab in sidebar. */
async function navigateToCity(dom: DomUtils): Promise<void> {
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

  // Broad fallback: leaf nodes
  const allEls = doc.querySelectorAll("*");
  for (const el of allEls) {
    if (el.children.length > 0) continue;
    const text = el.textContent?.trim();
    if (text === "City" || text === "city") {
      dom.clickTrusted(findClickableAncestor(el));
      await dom.sleep(300);
      return;
    }
  }

  throw new Error("Casino: could not find City tab in sidebar");
}

/** Click "Iker Molina Casino" on the city map. */
export async function navigateToCasino(dom: DomUtils): Promise<void> {
  await navigateToCity(dom);

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const ariaEl = doc.querySelector('[aria-label="Iker Molina Casino"]');
    if (ariaEl) {
      dom.clickTrusted(ariaEl);
      await dom.sleep(500);
      return;
    }

    const btn = findButtonByText("Iker Molina Casino");
    if (btn) {
      dom.clickTrusted(btn);
      await dom.sleep(500);
      return;
    }

    const el = findClickableByText("Iker Molina Casino");
    if (el) {
      dom.clickTrusted(findClickableAncestor(el));
      await dom.sleep(500);
      return;
    }

    await dom.sleep(200);
  }

  throw new Error("Casino: could not find Iker Molina Casino in city view (is the player in Aevum?)");
}

/** Click "Play blackjack" on the casino location page. */
export async function clickPlayBlackjack(dom: DomUtils): Promise<void> {
  await dom.sleep(300);

  const buttons = doc.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent?.trim().toLowerCase() ?? "";
    if (text.includes("play blackjack")) {
      dom.clickTrusted(btn);
      await dom.sleep(500);
      return;
    }
  }

  const el = findClickableByText("play blackjack");
  if (el) {
    dom.clickTrusted(findClickableAncestor(el));
    await dom.sleep(500);
    return;
  }

  throw new Error("Casino: could not find 'Play blackjack' button");
}

// === STATE DETECTION ===

/** Check if the location page shows "Iker Molina Casino" in an h4. */
export function isAtCasino(): boolean {
  const headers = doc.querySelectorAll("h4");
  for (const h of headers) {
    if (h.textContent?.includes("Iker Molina Casino")) return true;
  }
  return false;
}

/** Check if blackjack UI is active (wager input OR game buttons visible). */
export function isBlackjackActive(): boolean {
  const buttons = doc.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent?.trim().toLowerCase() ?? "";
    if (text === "stop playing") return true;
  }
  return false;
}

/** Check if a hand is in progress (Hit/Stay buttons visible). */
export function isGameInProgress(): boolean {
  return findButtonByText("Hit") !== null && findButtonByText("Stay") !== null;
}

/** Check if kicked out — dialog with "cheater" text. */
export function isKickedOut(): boolean {
  const dialogs = doc.querySelectorAll('.MuiModal-root, [role="dialog"], [role="presentation"]');
  for (const dialog of dialogs) {
    const text = dialog.textContent?.toLowerCase() ?? "";
    if (text.includes("cheater")) return true;
  }
  return false;
}

// === REACT FIBER STATE ACCESS ===

/**
 * Blackjack class component instance shape (runtime access).
 * The actual class is in vendor/.../Casino/Blackjack.tsx.
 */
interface CardLike {
  value: number;
  suit: string;
}

interface HandLike {
  cards: readonly CardLike[];
}

interface BlackjackInstance {
  state: {
    playerHand: HandLike;
    dealerHand: HandLike;
    gameInProgress: boolean;
    result: string; // Result enum: "" | "You won!" | "You Won! Blackjack!" | "You lost!" | "Push! (Tie)"
    bet: number;
    gains: number;
    wagerInvalid: boolean;
  };
  deck: Record<string, unknown>;
  getTrueHandValue: (hand: HandLike) => number;
}

/**
 * Walk the React fiber tree from a DOM element in the Blackjack UI
 * to find the class component's stateNode.
 *
 * For React class components, fiber.stateNode is the component instance,
 * giving us direct access to state, deck, and methods.
 */
export function getBlackjackInstance(): BlackjackInstance | null {
  // Find any element in the blackjack UI to start fiber walk
  const startEl =
    doc.querySelector('input[type="number"]') ??
    findButtonByText("Hit") ??
    findButtonByText("Stay") ??
    findButtonByText("Start");

  if (!startEl) return null;

  const fiberKey = Object.keys(startEl).find(k => k.startsWith("__reactFiber$"));
  if (!fiberKey) return null;

  let fiber = (startEl as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | undefined;
  let depth = 0;

  while (fiber && depth < 50) {
    const stateNode = fiber.stateNode as Record<string, unknown> | null;
    if (
      stateNode &&
      typeof stateNode === "object" &&
      stateNode.state &&
      typeof stateNode.state === "object" &&
      (stateNode.state as Record<string, unknown>).dealerHand &&
      stateNode.deck
    ) {
      return stateNode as unknown as BlackjackInstance;
    }
    fiber = fiber.return as Record<string, unknown> | undefined;
    depth++;
  }

  return null;
}

// === GAME STATE FROM FIBER ===

export interface GameState {
  playerValue: number;
  dealerValue: number;
  gameInProgress: boolean;
  result: GameResult;
}

/**
 * Read full game state directly from the Blackjack component instance.
 * This sees the dealer's full hand (both cards), not just the upcard.
 */
export function readGameState(instance: BlackjackInstance): GameState {
  const playerValue = instance.getTrueHandValue(instance.state.playerHand);
  const dealerValue = instance.getTrueHandValue(instance.state.dealerHand);

  let result: GameResult = null;
  const r = instance.state.result;
  if (r === "You Won! Blackjack!") result = "blackjack";
  else if (r === "You won!") result = "win";
  else if (r === "You lost!") result = "loss";
  else if (r === "Push! (Tie)") result = "tie";

  return {
    playerValue,
    dealerValue,
    gameInProgress: instance.state.gameInProgress,
    result,
  };
}

// === WAGER INPUT ===

/**
 * Set the wager amount via React's onChange handler.
 */
export function setWager(dom: DomUtils, amount: number): void {
  const input = doc.querySelector('input[type="number"]') as HTMLInputElement | null;
  if (!input) throw new Error("Casino: wager input not found");

  const value = String(amount);

  const reactProps = dom.getReactProps(input);
  if (reactProps?.onChange) {
    (reactProps.onChange as (e: unknown) => void)({ target: { value } });
    return;
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value"
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/**
 * Check if the current wager is valid via React component state.
 * Falls back to DOM check if fiber instance isn't available.
 */
export function isWagerValid(): boolean {
  const instance = getBlackjackInstance();
  if (instance) return !instance.state.wagerInvalid;

  // DOM fallback
  const input = doc.querySelector('input[type="number"]') as HTMLInputElement | null;
  if (!input) return false;
  if (input.getAttribute("aria-invalid") === "true") return false;
  const container = input.closest(".MuiFormControl-root, .MuiTextField-root");
  if (container) {
    const helperText = container.querySelector(".MuiFormHelperText-root");
    if (helperText && helperText.textContent?.trim()) return false;
  }
  return true;
}

// === GAME ACTIONS ===

/** Click the "Start" button (checks isTrusted). */
export function clickStart(dom: DomUtils): void {
  const btn = findButtonByText("Start");
  if (!btn) throw new Error("Casino: Start button not found");
  dom.clickTrusted(btn);
}

/** Click the "Hit" button (checks isTrusted). */
export function clickHit(dom: DomUtils): void {
  const btn = findButtonByText("Hit");
  if (!btn) throw new Error("Casino: Hit button not found");
  dom.clickTrusted(btn);
}

/** Click the "Stay" button (checks isTrusted). */
export function clickStay(dom: DomUtils): void {
  const btn = findButtonByText("Stay");
  if (!btn) throw new Error("Casino: Stay button not found");
  dom.clickTrusted(btn);
}

// === RESULT DETECTION ===

export type GameResult = "win" | "blackjack" | "loss" | "tie" | null;

/** Read the game result from the DOM. Returns null if no result visible. */
export function readGameResult(): GameResult {
  const elements = doc.querySelectorAll("p, .MuiTypography-root");
  for (const el of elements) {
    const text = el.textContent?.trim() ?? "";
    if (text.startsWith("You Won! Blackjack!")) return "blackjack";
    if (text.startsWith("You won!")) return "win";
    if (text.startsWith("You lost!")) return "loss";
    if (text.startsWith("Push! (Tie)")) return "tie";
  }
  return null;
}

// === PERFECT INFORMATION STRATEGY ===

export type Action = "hit" | "stay";

/** Get the deck's upcoming cards array (private field accessed at runtime). */
export function getDeckCards(instance: BlackjackInstance): CardLike[] | null {
  const cards = instance.deck["cards"] as CardLike[] | undefined;
  if (!Array.isArray(cards) || cards.length === 0) return null;
  return cards;
}

/** Compute hand value for an array of cards using the instance's method. */
function handValue(instance: BlackjackInstance, cards: readonly CardLike[]): number {
  return instance.getTrueHandValue({ cards });
}

/**
 * Simulate the dealer drawing to 17+ starting from deckOffset in the deck.
 * Returns the final dealer hand value.
 */
function simulateDealer(
  instance: BlackjackInstance,
  dealerCards: readonly CardLike[],
  deck: readonly CardLike[],
  deckOffset: number,
): number {
  const simCards = [...dealerCards];
  let val = handValue(instance, simCards);
  let idx = deckOffset;

  while (val <= 16 && idx < deck.length) {
    simCards.push(deck[idx]);
    val = handValue(instance, simCards);
    idx++;
  }

  return val;
}

/** Score an outcome: win=2, tie=1, loss=0. */
function outcomeScore(playerVal: number, dealerFinal: number): number {
  if (playerVal > 21) return 0; // bust
  if (dealerFinal > 21) return 2; // dealer bust
  if (playerVal > dealerFinal) return 2;
  if (playerVal === dealerFinal) return 1;
  return 0;
}

/**
 * Perfect-information strategy with deck peeking.
 *
 * We can see the dealer's hole card AND the upcoming deck order.
 * For each decision, simulate both outcomes:
 *   STAY: dealer draws from deck[0] onwards → compare scores
 *   HIT:  we take deck[0], dealer draws from deck[1] onwards → compare scores
 * Pick the better outcome. On ties in outcome, prefer stay (less risk).
 * If both outcomes lose, prefer hit (nothing to lose, might improve on re-eval).
 */
export function getAction(instance: BlackjackInstance): Action {
  const playerVal = instance.getTrueHandValue(instance.state.playerHand);

  if (playerVal >= 21) return "stay";

  const deck = getDeckCards(instance);
  if (!deck) return getActionFallback(instance);

  const dealerCards = instance.state.dealerHand.cards;
  const playerCards = instance.state.playerHand.cards;

  // Simulate STAY: dealer draws from deck[0]
  const dealerIfStay = simulateDealer(instance, dealerCards, deck, 0);
  const stayScore = outcomeScore(playerVal, dealerIfStay);

  // If staying already wins, stay
  if (stayScore === 2) return "stay";

  // Simulate HIT: we take deck[0], then dealer draws from deck[1]
  const hitCard = deck[0];
  const hitPlayerVal = handValue(instance, [...playerCards, hitCard]);

  if (hitPlayerVal > 21) {
    // Hitting busts us — stay (even a loss or tie is better than guaranteed bust)
    return "stay";
  }

  const dealerIfHit = simulateDealer(instance, dealerCards, deck, 1);
  const hitScore = outcomeScore(hitPlayerVal, dealerIfHit);

  if (hitScore > stayScore) return "hit";
  // Both lose → hit (nothing to lose, next re-eval might find a better path)
  if (stayScore === 0 && hitScore === 0) return "hit";
  return "stay";
}

export type HandPrediction = "win" | "loss" | "tie" | "unknown";

/**
 * Pre-screen the next hand before placing a bet.
 *
 * Between hands, deck[0..3] will be dealt as: player gets [0,1], dealer gets [2,3].
 * We simulate the full hand (player decisions + dealer draw-to-17) to predict the outcome.
 */
export function preScreenNextHand(instance: BlackjackInstance): HandPrediction {
  const deck = getDeckCards(instance);
  if (!deck || deck.length < 4) return "unknown";

  const playerCards: CardLike[] = [deck[0], deck[1]];
  const dealerCards: CardLike[] = [deck[2], deck[3]];

  const playerInitial = handValue(instance, playerCards);
  const dealerInitial = handValue(instance, dealerCards);

  // Check for natural blackjacks (21 from exactly 2 cards)
  if (playerInitial === 21) {
    return dealerInitial === 21 ? "tie" : "win";
  }
  if (dealerInitial === 21) return "loss";

  // Simulate player decisions greedily from deck[4] onwards
  let deckIdx = 4;
  let playerVal = playerInitial;

  while (deckIdx < deck.length) {
    // Evaluate outcome if we stay now
    const dealerIfStay = simulateDealer(instance, dealerCards, deck, deckIdx);
    const stayScore = outcomeScore(playerVal, dealerIfStay);

    // If staying wins, stop here
    if (stayScore === 2) break;

    // Check if hitting is possible
    if (deckIdx >= deck.length) break;

    const hitCard = deck[deckIdx];
    const hitPlayerVal = handValue(instance, [...playerCards, hitCard]);

    // If hitting busts, don't hit
    if (hitPlayerVal > 21) break;

    // Evaluate outcome if we hit then stay
    const dealerIfHit = simulateDealer(instance, dealerCards, deck, deckIdx + 1);
    const hitScore = outcomeScore(hitPlayerVal, dealerIfHit);

    if (hitScore > stayScore) {
      // Hitting improves outcome — take the card
      playerCards.push(hitCard);
      playerVal = hitPlayerVal;
      deckIdx++;
      continue;
    }

    if (stayScore === 0 && hitScore === 0) {
      // Both lose — hit anyway (nothing to lose, keep trying)
      playerCards.push(hitCard);
      playerVal = hitPlayerVal;
      deckIdx++;
      continue;
    }

    // Staying is at least as good as hitting — stop
    break;
  }

  // Simulate final dealer draw
  const dealerFinal = simulateDealer(instance, dealerCards, deck, deckIdx);
  const score = outcomeScore(playerVal, dealerFinal);

  if (score === 2) return "win";
  if (score === 1) return "tie";
  return "loss";
}

/** Fallback strategy when deck isn't accessible — uses full dealer hand knowledge. */
function getActionFallback(instance: BlackjackInstance): Action {
  const playerVal = instance.getTrueHandValue(instance.state.playerHand);
  const dealerVal = instance.getTrueHandValue(instance.state.dealerHand);

  if (playerVal >= 21) return "stay";

  if (dealerVal >= 17) {
    if (playerVal > dealerVal) return "stay";
    if (playerVal === dealerVal) return "stay";
    return "hit";
  }

  if (playerVal >= 17) return "stay";
  if (playerVal >= 13 && dealerVal >= 12) return "stay";
  if (playerVal <= 11) return "hit";
  return "hit";
}
