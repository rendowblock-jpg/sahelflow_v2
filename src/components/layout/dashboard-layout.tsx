"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useI18n } from "@/hooks/use-i18n";
import { useUIStore } from "@/stores/ui-store";
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
}

/**
 * SahelFlow desktop application frame.
 *
 * Locale and direction are consumed from the same reactive client authority as
 * translated copy. Server rendering still seeds that authority through the root
 * locale provider, but the shell never holds a stale server-only direction prop
 * after an interactive language switch.
 *
 * The workspace is one edge-to-edge software frame with durable navigation, one
 * command/title bar and one scroll authority for the active work surface. Client
 * route transitions move focus to the new main surface after the first render so
 * keyboard and screen-reader users receive an explicit page-entry point without
 * stealing focus during initial startup.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const { cheatsheetOpen, setCheatsheetOpen } = useKeyboardShortcuts();
  const { t, locale, dir } = useI18n();
  const density = useUIStore((state) => state.density);
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);

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

  useEffect(() => {
    const previous = previousPath.current;
    previousPath.current = pathname;
    if (previous === null || previous === pathname) return;

    const frame = window.requestAnimationFrame(() => {
      const main = document.getElementById("main-content");
      if (main instanceof HTMLElement) {
        main.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <div
      dir={dir}
      className="flex h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground"
      data-sahelflow-shell="desktop"
      data-density={density}
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

      {commandOpen && (
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      )}

      {cheatsheetOpen && (
        <CheatsheetModal
          open={cheatsheetOpen}
          onOpenChange={setCheatsheetOpen}
        />
      )}
    </div>
  );
}
