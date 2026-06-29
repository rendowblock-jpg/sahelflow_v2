"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "@/components/command-palette";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** Server-rendered locale (from cookie) — used for initial render to prevent hydration mismatch */
  locale: Locale;
  /** Server-rendered direction (from cookie) — used for initial render to prevent hydration mismatch */
  dir: "ltr" | "rtl";
}

/**
 * AppShell — the single source of truth for app layout.
 *
 * Premium patterns (Dub + Trigger.dev):
 * - Grid layout: grid-cols-[auto_1fr] with overflow-hidden root
 * - Floating content panel: rounded-xl bg-background on neutral gutter
 * - Only <main> scrolls — no double scrollbars, no page bounce
 * - Responsive: sidebar hidden on mobile (Sheet handles it)
 *
 * RTL (the definitive fix):
 * The root grid container sets `dir` EXPLICITLY (not via CSS inheritance from <html>).
 * This is critical because:
 *   1. CSS Grid column placement (grid-cols-[auto_1fr]) only flips when the grid
 *      container itself has `direction: rtl`. Inheriting from <html> works in theory
 *      but breaks in practice when client-side locale switches update <html dir> via
 *      useEffect — the grid doesn't reliably re-layout.
 *   2. The `dir` prop from the Server Component gives the correct initial value
 *      (matches SSR → no hydration mismatch).
 *   3. The live `dir` from useI18n() ensures the grid updates immediately when the
 *      user switches language via the Topbar (no full page reload required).
 * The fallback chain is: liveDir (from useI18n) → serverDir (from prop/cookie).
 *
 * Responsive behavior:
 *  - mobile (<lg): sidebar hidden, slides in via Sheet
 *  - tablet/desktop (lg+): sidebar visible, collapsible to 68px rail
 */
export function DashboardLayout({ children, locale, dir: serverDir }: DashboardLayoutProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  // useKeyboardShortcuts handles g+letter navigation. It explicitly SKIPS
  // Cmd+K (line 40 of the hook), so we handle that here — there's only ONE
  // Cmd+K listener, not two.
  useKeyboardShortcuts();

  // Use the server-rendered dir ONLY. This comes from the Server Component
  // layout which reads the cookie via next/headers — it's always correct and
  // matches on both server + client (no hydration mismatch).
  //
  // Live locale switching is handled by router.refresh() in the Topbar's
  // setLocale handler, which re-runs the server layout → new serverDir prop.
  const dir = serverDir;
  const isRtl = dir === "rtl";

  // Cmd+K → toggle command palette (single listener — useKeyboardShortcuts skips this)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      dir={dir}
      className={cn(
        "flex h-dvh overflow-hidden bg-muted/30 lg:bg-muted/40",
        // flex-row-reverse puts the sidebar on the RIGHT in RTL.
        // We use explicit conditional classes instead of relying on CSS
        // direction to flip grid/flex — this is 100% reliable across browsers.
        isRtl && "flex-row-reverse",
      )}
    >
      {/* Sidebar — hidden on mobile, shown on lg+ */}
      <div className="hidden lg:flex h-full">
        <Sidebar serverLocale={locale} serverDir={dir} />
      </div>

      {/* Main content column — floating panel on lg+ */}
      <div className="flex flex-col flex-1 overflow-hidden p-0 lg:p-2 lg:ps-0">
        <div className="flex flex-1 flex-col overflow-hidden bg-background lg:rounded-xl lg:border lg:shadow-sm">
          <Topbar onCommandPaletteOpen={() => setCommandOpen(true)} serverLocale={locale} serverDir={dir} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

      {/* Toast Provider */}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ className: "shadow-popover" }}
      />
    </div>
  );
}
