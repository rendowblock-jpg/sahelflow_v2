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
 * Skips when typing in inputs/textareas/contentEditable.
 */
export function useKeyboardShortcuts() {
  const router = useRouter();
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useEffect(() => {
    let lastKey = "";
    let lastKeyTime = 0;
    const DOUBLE_KEY_DELAY = 500;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "k") return;

      const now = Date.now();
      const key = e.key.toLowerCase();

      // g + letter navigation
      if (lastKey === "g" && now - lastKeyTime < DOUBLE_KEY_DELAY) {
        const routes: Record<string, string> = {
          d: "/dashboard", o: "/orders", c: "/customers", p: "/products",
          i: "/inbox", a: "/analytics", s: "/settings", l: "/deliveries", r: "/returns",
        };
        if (routes[key]) {
          e.preventDefault();
          router.push(routes[key]!);
        }
        lastKey = "";
        return;
      }

      // Single-key shortcuts (only when not in g-sequence)
      if (lastKey !== "g") {
        if (key === "g") {
          lastKey = "g";
          lastKeyTime = now;
          return;
        }
        if (key === "o") {
          e.preventDefault();
          router.push("/orders");
          return;
        }
        if (key === "c") {
          e.preventDefault();
          router.push("/customers");
          return;
        }
        if (key === "p") {
          e.preventDefault();
          router.push("/products");
          return;
        }
        if (key === "/") {
          e.preventDefault();
          // Focus the first search input on the page
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[type="search"], input[placeholder*="search" i], input[data-testid="table-search"]'
          );
          searchInput?.focus();
          return;
        }
        if (key === "?") {
          e.preventDefault();
          setCheatsheetOpen(true);
          return;
        }
      }

      lastKey = "";
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return { cheatsheetOpen, setCheatsheetOpen };
}
