"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "@/components/command-palette";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { Toaster } from "@/components/ui/sonner";

/**
 * AppShell — the single source of truth for app layout.
 *
 * Premium patterns (Dub + Trigger.dev):
 * - Grid layout: grid-cols-[auto_1fr] with overflow-hidden root
 * - Floating content panel: rounded-xl bg-background on neutral gutter
 * - Only <main> scrolls — no double scrollbars, no page bounce
 * - Responsive: sidebar hidden on mobile (Sheet handles it)
 *
 * Responsive behavior:
 *  - mobile (<lg): sidebar hidden, slides in via Sheet
 *  - tablet/desktop (lg+): sidebar visible, collapsible to 68px rail
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  useKeyboardShortcuts();

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
    <div className="grid h-dvh grid-cols-[auto_1fr] overflow-hidden bg-muted/30 lg:bg-muted/40">
      {/* Sidebar — hidden on mobile, shown on lg+ */}
      <div className="hidden lg:flex h-full">
        <Sidebar />
      </div>

      {/* Main content column — floating panel on lg+ */}
      <div className="flex flex-col overflow-hidden p-0 lg:p-2 lg:ps-0">
        <div className="flex flex-1 flex-col overflow-hidden bg-background lg:rounded-xl lg:border lg:shadow-sm">
          <Topbar onCommandPaletteOpen={() => setCommandOpen(true)} />
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
