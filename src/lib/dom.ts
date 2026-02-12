/**
 * DOM Utilities
 *
 * Shared helpers for DOM-based automation in Bitburner.
 * Used by infiltration daemon and any future DOM-interacting scripts.
 *
 * Zero NS imports — pure DOM/browser APIs.
 */

export interface DomUtils {
  query<T extends Element>(selector: string, parent?: Element): T | null;
  queryRequired<T extends Element>(selector: string, parent?: Element): T;
  queryAll<T extends Element>(selector: string, parent?: Element): T[];
  waitForElement<T extends Element>(selector: string, timeoutMs?: number): Promise<T>;
  waitForElementGone(selector: string, timeoutMs?: number): Promise<void>;
  click(el: Element): void;
  clickTrusted(el: Element): void;
  type(text: string): void;
  pressKey(key: string): void;
  sleep(ms: number): Promise<void>;
  getGameContainer(): Element | null;
  getReactProps(el: Element): Record<string, unknown> | null;
}

const doc = globalThis["document"] as Document;

// === isTrusted bypass ===
// Bitburner checks event.isTrusted on keydown to detect automation.
// We wrap addEventListener to intercept keydown handlers and proxy events
// so that synthetic events appear trusted.

let bypassInstalled = false;

export function installTrustBypass(): void {
  if (bypassInstalled) return;
  bypassInstalled = true;

  const origAdd = doc.addEventListener.bind(doc);
  const origRemove = doc.removeEventListener.bind(doc);

  // Map original callback -> wrapped callback for cleanup
  const wrapperMap = new WeakMap<EventListenerOrEventListenerObject, EventListenerOrEventListenerObject>();

  doc.addEventListener = function (
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === "keydown" && callback) {
      const wrapper = function (this: unknown, event: Event) {
        const proxied = new Proxy(event, {
          get(target, prop) {
            if (prop === "isTrusted") return true;
            const val = (target as unknown as Record<string | symbol, unknown>)[prop];
            return typeof val === "function" ? (val as (...args: unknown[]) => unknown).bind(target) : val;
          },
        });
        if (typeof callback === "function") {
          callback.call(this, proxied);
        } else {
          callback.handleEvent(proxied);
        }
      };
      wrapperMap.set(callback, wrapper);
      return origAdd(type, wrapper, options);
    }
    return origAdd(type, callback, options);
  };

  doc.removeEventListener = function (
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) {
    if (type === "keydown" && callback) {
      const wrapper = wrapperMap.get(callback);
      if (wrapper) {
        wrapperMap.delete(callback);
        return origRemove(type, wrapper, options);
      }
    }
    return origRemove(type, callback, options);
  };
}

// === Core DOM helpers ===

function query<T extends Element>(selector: string, parent?: Element): T | null {
  return (parent ?? doc).querySelector<T>(selector);
}

function queryRequired<T extends Element>(selector: string, parent?: Element): T {
  const el = query<T>(selector, parent);
  if (!el) {
    throw new Error(`DOM element not found: ${selector}`);
  }
  return el;
}

function queryAll<T extends Element>(selector: string, parent?: Element): T[] {
  return Array.from((parent ?? doc).querySelectorAll<T>(selector));
}

function waitForElement<T extends Element>(
  selector: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const existing = doc.querySelector<T>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let settled = false;

    const observer = new MutationObserver(() => {
      const el = doc.querySelector<T>(selector);
      if (el && !settled) {
        settled = true;
        observer.disconnect();
        clearInterval(pollId);
        clearTimeout(timeoutId);
        resolve(el);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });

    const pollId = setInterval(() => {
      const el = doc.querySelector<T>(selector);
      if (el && !settled) {
        settled = true;
        observer.disconnect();
        clearInterval(pollId);
        clearTimeout(timeoutId);
        resolve(el);
      }
    }, 50);

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        observer.disconnect();
        clearInterval(pollId);
        reject(new Error(`Timeout waiting for element: ${selector} (${timeoutMs}ms)`));
      }
    }, timeoutMs);
  });
}

function waitForElementGone(
  selector: string,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!doc.querySelector(selector)) {
      resolve();
      return;
    }

    let settled = false;

    const observer = new MutationObserver(() => {
      if (!doc.querySelector(selector) && !settled) {
        settled = true;
        observer.disconnect();
        clearInterval(pollId);
        clearTimeout(timeoutId);
        resolve();
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });

    const pollId = setInterval(() => {
      if (!doc.querySelector(selector) && !settled) {
        settled = true;
        observer.disconnect();
        clearInterval(pollId);
        clearTimeout(timeoutId);
        resolve();
      }
    }, 50);

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        observer.disconnect();
        clearInterval(pollId);
        reject(new Error(`Timeout waiting for element to disappear: ${selector} (${timeoutMs}ms)`));
      }
    }, timeoutMs);
  });
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

/**
 * Click via React internal props to bypass isTrusted checks on buttons.
 *
 * Bitburner's "Infiltrate Company" button checks `e.isTrusted` in its onClick handler.
 * We find the React fiber/props attached to the DOM element and call onClick directly
 * with a plain object where isTrusted = true.
 *
 * We can't use Object.defineProperty on a real MouseEvent because isTrusted is
 * non-configurable on native Event objects. Instead we pass a plain object that
 * quacks like a MouseEvent enough for the handler's `if (!e.isTrusted) return` check.
 *
 * React attaches props as `__reactProps$<hash>` and fibers as `__reactFiber$<hash>`.
 */
function clickTrusted(el: Element): void {
  const clickHandlerNames = ["onClick", "onMouseDown", "onPointerDown"];

  function makeFakeEvent(target: Element): Record<string, unknown> {
    return {
      isTrusted: true,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      target,
      currentTarget: target,
      type: "click",
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
      preventDefault() { /* noop */ },
      stopPropagation() { /* noop */ },
      persist() { /* noop - React synthetic event method */ },
      nativeEvent: { isTrusted: true },
    };
  }

  function tryCallHandler(props: Record<string, unknown>, target: Element): boolean {
    for (const name of clickHandlerNames) {
      if (typeof props[name] === "function") {
        (props[name] as (e: unknown) => void)(makeFakeEvent(target));
        return true;
      }
    }
    return false;
  }

  // Strategy 1: __reactProps$ on the element itself
  const propsKey = Object.keys(el).find(k => k.startsWith("__reactProps$"));
  if (propsKey) {
    const props = (el as unknown as Record<string, unknown>)[propsKey] as Record<string, unknown> | undefined;
    if (props && tryCallHandler(props, el)) return;
  }

  // Strategy 2: __reactFiber$ — walk fiber tree for memoizedProps/pendingProps handlers
  const fiberKey = Object.keys(el).find(k => k.startsWith("__reactFiber$"));
  if (fiberKey) {
    let fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | undefined;
    let depth = 0;
    while (fiber && depth < 20) {
      for (const propName of ["memoizedProps", "pendingProps"]) {
        const p = fiber[propName] as Record<string, unknown> | undefined;
        if (p && tryCallHandler(p, el)) return;
      }
      fiber = fiber.return as Record<string, unknown> | undefined;
      depth++;
    }
  }

  // Strategy 3: Walk up the DOM tree — check both __reactProps$ and __reactFiber$ on each ancestor
  let ancestor: Element | null = el.parentElement;
  let ancDepth = 0;
  while (ancestor && ancDepth < 15) {
    // Check reactProps on ancestor
    const ancPropsKey = Object.keys(ancestor).find(k => k.startsWith("__reactProps$"));
    if (ancPropsKey) {
      const ancProps = (ancestor as unknown as Record<string, unknown>)[ancPropsKey] as Record<string, unknown> | undefined;
      if (ancProps && tryCallHandler(ancProps, ancestor)) return;
    }
    // Check reactFiber on ancestor
    const ancFiberKey = Object.keys(ancestor).find(k => k.startsWith("__reactFiber$"));
    if (ancFiberKey) {
      let fiber = (ancestor as unknown as Record<string, unknown>)[ancFiberKey] as Record<string, unknown> | undefined;
      let fDepth = 0;
      while (fiber && fDepth < 10) {
        for (const propName of ["memoizedProps", "pendingProps"]) {
          const p = fiber[propName] as Record<string, unknown> | undefined;
          if (p && tryCallHandler(p, ancestor)) return;
        }
        fiber = fiber.return as Record<string, unknown> | undefined;
        fDepth++;
      }
    }
    ancestor = ancestor.parentElement;
    ancDepth++;
  }

  // Strategy 4: Use React's synthetic event system via __reactFiber$
  // Walk from the element's fiber up to find a stateNode with click() or dispatchEvent
  if (fiberKey) {
    let fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | undefined;
    let depth = 0;
    while (fiber && depth < 20) {
      const stateNode = fiber.stateNode as HTMLElement | null;
      if (stateNode && stateNode !== el && typeof stateNode.click === "function") {
        stateNode.click();
        return;
      }
      fiber = fiber.return as Record<string, unknown> | undefined;
      depth++;
    }
  }

  // Fallback: dispatch a regular click event
  click(el);
}

function type(text: string): void {
  for (const char of text) {
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
  }
}

function pressKey(key: string): void {
  doc.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Get the active infiltration game container (last MuiPaper-root in the MuiContainer). */
function getGameContainer(): Element | null {
  const container = doc.querySelector(".MuiContainer-root");
  if (!container) return null;
  const papers = container.querySelectorAll(":scope > .MuiPaper-root");
  return papers.length > 0 ? papers[papers.length - 1] : null;
}

/** Get React internal props from a DOM element. */
function getReactProps(el: Element): Record<string, unknown> | null {
  const key = Object.keys(el).find(k => k.startsWith("__reactProps$"));
  if (!key) return null;
  return (el as unknown as Record<string, unknown>)[key] as Record<string, unknown>;
}

export const domUtils: DomUtils = {
  query,
  queryRequired,
  queryAll,
  waitForElement,
  waitForElementGone,
  click,
  clickTrusted,
  type,
  pressKey,
  sleep,
  getGameContainer,
  getReactProps,
};
