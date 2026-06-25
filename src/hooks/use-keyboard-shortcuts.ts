"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts hook.
 * 
 * Shortcuts:
 * - Cmd/Ctrl + K: Command palette (handled by DashboardLayout)
 * - g d: Go to Dashboard
 * - g o: Go to Orders
 * - g c: Go to Customers
 * - g p: Go to Products
 * - g i: Go to Inbox
 * - g a: Go to Analytics
 * - g s: Go to Settings
 * - ?: Show shortcuts help (future)
 */
export function useKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    let lastKey = "";
    let lastKeyTime = 0;
    const DOUBLE_KEY_DELAY = 500; // ms

    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Cmd/Ctrl+K is handled by the layout — don't interfere
      if ((e.metaKey || e.ctrlKey) && e.key === "k") return;

      const now = Date.now();
      const key = e.key.toLowerCase();

      // "g" + letter pattern for navigation (Gmail-style)
      if (lastKey === "g" && now - lastKeyTime < DOUBLE_KEY_DELAY) {
        const routes: Record<string, string> = {
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
        if (routes[key]) {
          e.preventDefault();
          router.push(routes[key]!);
        }
        lastKey = "";
        return;
      }

      if (key === "g") {
        lastKey = "g";
        lastKeyTime = now;
      } else {
        lastKey = "";
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);
}
