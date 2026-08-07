"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const CommandPalette = dynamic(() =>
  import("@/components/command-palette").then(
    (module) => module.CommandPalette,
  ),
);
const CheatsheetModal = dynamic(() =>
  import("@/components/shared/cheatsheet-modal").then(
    (module) => module.CheatsheetModal,
  ),
);

interface DashboardLayoutProps {
  children: React.ReactNode;
  locale: Locale;
  dir: "ltr" | "rtl";
}

/**
 * SahelFlow desktop application frame.
 *
 * Phase 5 deliberately removes the floating rounded "web dashboard inside a
 * page" treatment. The canonical workspace is one edge-to-edge software frame:
 * durable domain navigation, one command/title bar and one scroll authority for
 * the active work surface. This keeps focus, keyboard navigation, zoom and
 * contained WebView behavior predictable.
 */
export function DashboardLayout({
  children,
  locale,
  dir: serverDir,
}: DashboardLayoutProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const { cheatsheetOpen, setCheatsheetOpen } = useKeyboardShortcuts();
  const { t } = useI18n();
  const dir = serverDir;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      dir={dir}
      className="flex h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground"
      data-sahelflow-shell="desktop"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[100] focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
      >
        {t("common.skipToContent")}
      </a>

      <div className="hidden h-full min-h-0 shrink-0 lg:flex">
        <Sidebar serverLocale={locale} serverDir={dir} />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          onCommandPaletteOpen={() => setCommandOpen(true)}
          serverLocale={locale}
          serverDir={dir}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scroll-pt-14 outline-none"
        >
          {children}
        </main>
      </div>

      {commandOpen ? (
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      ) : null}

      {cheatsheetOpen ? (
        <CheatsheetModal
          open={cheatsheetOpen}
          onOpenChange={setCheatsheetOpen}
        />
      ) : null}
    </div>
  );
}
