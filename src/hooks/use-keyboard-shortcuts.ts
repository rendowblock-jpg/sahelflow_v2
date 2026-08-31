"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts hook (Phase 2 enhanced).
 *
 * Shortcuts:
 * - Cmd/Ctrl + K: Command palette (handled by DashboardLayout)
 * - g + letter: Go to page (Gmail-style)
 *   - g d: Dashboard, g o: Orders, g c: Customers, g p: Products
 *   - g l: Deliveries, g r: Returns, g i: Inbox, g a: Analytics, g s: Settings
 * - o: New order (navigates to /orders, opens form)
 * - c: New customer
 * - p: New product
 * - /: Focus the page's search input (if present)
 * - ?: Show keyboard shortcuts cheatsheet
 *
 * Layout independence (audit d6 #4): letter shortcuts match on the PHYSICAL
 * key (e.code === "KeyG" etc.), not on e.key. On an Arabic keyboard layout the
 * physical G key produces "ل", K produces "ن", O produces "ه" — e.key matching
 * would make every letter shortcut dead. e.code is layout-independent, so the
 * same physical chord works on Latin AND Arabic (or any other) layouts; the
 * e.key character is kept as a fallback for synthetic/legacy events that do
 * not report a code. Non-letter keys (/, ?, arrows, Escape) stay on e.key —
 * they are layout-safe because the shortcut fires on whatever physical key
 * produces that character on the user's layout.
 *
 * Skips when typing in inputs/textareas/contentEditable.
 * Skips all shortcuts when a dialog/modal/popover/dropdown is open (W3-16),
 * so typing "n" inside a dialog input can't trigger navigation. Escape is
 * still allowed to pass through (Radix handles closing the overlay natively).
 */

/**
 * Detect whether any overlay (dialog, modal, popover, dropdown) is open.
 * Used to suppress global single-key shortcuts while the user is interacting
 * with an overlay — otherwise pressing "n" inside a dialog input could
 * trigger "new order" navigation and lose the user's input.
 *
 * Checks (in order):
 *   1. Native <dialog> elements (open attribute).
 *   2. Radix dialog / alertdialog overlays (data-state="open").
 *   3. Radix popper-content wrappers (popovers, dropdown menus, command palettes).
 *   4. Radix Select content (role="listbox" with data-state="open").
 *
 * Returns true if ANY overlay is open.
 */
function isOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  // Native <dialog> elements
  if (document.querySelector("dialog[open]")) return true;
  // Radix UI dialogs / alertdialogs / sheets
  if (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    )
  ) {
    return true;
  }
  // Radix popovers / dropdown menus / command palettes (popper content wrappers
  // are empty when no popover is open — :not(:empty) filters them out).
  if (
    document.querySelector(
      '[data-radix-popper-content-wrapper]:not(:empty), [role="listbox"][data-state="open"]',
    )
  ) {
    return true;
  }
  return false;
}

/** Keyboard-event surface consumed by the pure shortcut engine. */
export interface ShortcutEvent {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

/** g-sequence memory (`lastKey` is only ever "" or "g"). */
export interface ShortcutSequenceState {
  lastKey: string;
  lastKeyTime: number;
}

export const EMPTY_SHORTCUT_SEQUENCE: ShortcutSequenceState = {
  lastKey: "",
  lastKeyTime: 0,
};

const DOUBLE_KEY_DELAY = 500;

const GO_ROUTES: Record<string, string> = {
  d: "/dashboard",
  o: "/orders",
  c: "/customers",
  p: "/products",
  i: "/inbox",
  a: "/analytics",
  s: "/settings",
  l: "/deliveries",
  r: "/returns",
};

/**
 * True when the event's physical key is the given letter — on ANY keyboard
 * layout. Arabic layouts keep the Latin `code` (physical G reports code
 * "KeyG" while producing the character "ل"), so a code match covers Arabic;
 * the e.key character match covers events without a code.
 */
export function matchPhysicalLetter(
  event: ShortcutEvent,
  letter: string,
): boolean {
  const normalized = letter.toLowerCase();
  if (event.key && event.key.toLowerCase() === normalized) return true;
  return event.code === `Key${normalized.toUpperCase()}`;
}

/**
 * Layout-independent letter for a keydown event: "g" for the physical G key
 * whether it produced "g" (Latin) or "ل" (Arabic). Non-letter keys (/, ?,
 * arrows…) fall back to the produced character, which is layout-safe for
 * character-based shortcuts.
 */
export function normalizeShortcutLetter(event: ShortcutEvent): string {
  const code = event.code ?? "";
  if (code.length === 4 && code.startsWith("Key")) {
    const physical = code.slice(3);
    if (physical >= "A" && physical <= "Z") return physical.toLowerCase();
  }
  return (event.key ?? "").toLowerCase();
}

export type ShortcutOutcome =
  | { kind: "none" }
  | { kind: "navigate"; route: string }
  | { kind: "focus-search" }
  | { kind: "open-cheatsheet" };

export interface ShortcutResolution {
  state: ShortcutSequenceState;
  outcome: ShortcutOutcome;
}

/**
 * Pure decision core of the global shortcut handler — no DOM, no router, so
 * the layout-independence contract (Latin, Arabic, code-less events, sequence
 * expiry) is directly unit-testable.
 */
export function resolveShortcut(
  state: ShortcutSequenceState,
  event: ShortcutEvent,
  now: number,
): ShortcutResolution {
  // Cmd/Ctrl+K toggles the command palette in DashboardLayout — bail (and
  // keep any armed g-sequence) before the physical K ("ن" on Arabic layouts)
  // can be mistaken for a letter shortcut.
  if ((event.metaKey || event.ctrlKey) && matchPhysicalLetter(event, "k")) {
    return { state, outcome: { kind: "none" } };
  }

  const key = normalizeShortcutLetter(event);

  // g + letter navigation (Gmail-style): the second key is matched by its
  // PHYSICAL position so "g o" survives an Arabic layout.
  if (state.lastKey === "g" && now - state.lastKeyTime < DOUBLE_KEY_DELAY) {
    const route = GO_ROUTES[key];
    if (route) {
      return {
        state: EMPTY_SHORTCUT_SEQUENCE,
        outcome: { kind: "navigate", route },
      };
    }
    // Any non-route key ends the sequence without firing anything.
    return { state: EMPTY_SHORTCUT_SEQUENCE, outcome: { kind: "none" } };
  }

  // Single-key shortcuts (only when not inside a g-sequence).
  if (state.lastKey !== "g") {
    if (key === "g") {
      return {
        state: { lastKey: "g", lastKeyTime: now },
        outcome: { kind: "none" },
      };
    }
    if (key === "o") {
      return {
        state: EMPTY_SHORTCUT_SEQUENCE,
        outcome: { kind: "navigate", route: "/orders" },
      };
    }
    if (key === "c") {
      return {
        state: EMPTY_SHORTCUT_SEQUENCE,
        outcome: { kind: "navigate", route: "/customers" },
      };
    }
    if (key === "p") {
      return {
        state: EMPTY_SHORTCUT_SEQUENCE,
        outcome: { kind: "navigate", route: "/products" },
      };
    }
    if (key === "/") {
      return {
        state: EMPTY_SHORTCUT_SEQUENCE,
        outcome: { kind: "focus-search" },
      };
    }
    if (key === "?") {
      return {
        state: EMPTY_SHORTCUT_SEQUENCE,
        outcome: { kind: "open-cheatsheet" },
      };
    }
  }

  return { state: EMPTY_SHORTCUT_SEQUENCE, outcome: { kind: "none" } };
}

export function useKeyboardShortcuts() {
  const router = useRouter();
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useEffect(() => {
    let sequence = EMPTY_SHORTCUT_SEQUENCE;

    const handler = (e: KeyboardEvent) => {
      // W3-16: Skip all shortcuts while a dialog/modal/popover/dropdown is open.
      // Radix handles Escape natively (closes the overlay) — let it pass through
      // by NOT bailing on Escape.
      if (isOverlayOpen() && e.key !== "Escape") return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const { state, outcome } = resolveShortcut(sequence, e, Date.now());
      sequence = state;

      switch (outcome.kind) {
        case "navigate":
          e.preventDefault();
          router.push(outcome.route);
          break;
        case "focus-search": {
          e.preventDefault();
          // Focus the first search input on the page
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[type="search"], input[placeholder*="search" i], input[data-testid="table-search"]',
          );
          searchInput?.focus();
          break;
        }
        case "open-cheatsheet":
          e.preventDefault();
          setCheatsheetOpen(true);
          break;
        case "none":
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return { cheatsheetOpen, setCheatsheetOpen };
}
