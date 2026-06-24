"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "@/components/command-palette";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

/**
 * AppShell — the single source of truth for app layout.
 *
 * Responsive behavior:
 *  - mobile (<lg): sidebar hidden, slides in via Sheet (Topbar handles)
 *  - tablet (lg): sidebar visible, collapsible to 60px rail
 *  - desktop (xl+): same as tablet, content max-width capped for readability
 *
 * RTL: the sidebar is placed on the inline-start side automatically by flexbox
 * (no physical left/right). The main content area takes flex-1.
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);

  // Cmd+K / Ctrl+K shortcut for command palette
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
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Sidebar: hidden on mobile, shown on lg+ */}
      <div className="hidden lg:flex h-full">
        <Sidebar />
      </div>

      {/* Main content column */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Topbar onCommandPaletteOpen={() => setCommandOpen(true)} />
        <main className={cn("flex-1 overflow-y-auto overflow-x-hidden")}>
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />

      {/* Toast Provider */}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          className: "shadow-elevated",
        }}
      />
    </div>
  );
}
