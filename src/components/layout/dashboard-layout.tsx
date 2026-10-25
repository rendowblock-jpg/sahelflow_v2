"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import {
  matchPhysicalLetter,
  useKeyboardShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import { ActorAccessProvider } from "@/components/layout/actor-access";
import type { Phase2Action } from "@/lib/identity/permissions";
import { useI18n } from "@/hooks/use-i18n";
import { useUiDensity } from "@/hooks/use-ui-density";
import { warmUniversalSearchClient } from "@/lib/search/universal-search-client";
import { seedCommandPalette } from "@/components/search/command-palette-seed";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

function CommandPalettePlaceholder() {
  const { t } = useI18n();
  return (
    <div
      className="relative mx-auto hidden min-w-0 max-w-xl flex-1 sm:block"
      data-command-trigger="true"
    >
      <div className="flex h-8 min-h-(--sf-touch-target) items-center gap-2 rounded-surface border border-border/80 bg-muted/30 px-2.5">
        <input
          data-command-seed="true"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-keyshortcuts="Control+K"
          aria-label={t("topbar.searchPlaceholder")}
          placeholder={t("topbar.searchPlaceholder")}
          className="h-full min-w-0 flex-1 bg-transparent text-body-sm text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            seedCommandPalette({ query: event.target.value, open: true });
          }}
          onFocus={() => seedCommandPalette({ open: true })}
        />
        <kbd
          dir="ltr"
          className="pointer-events-none inline-flex h-5 shrink-0 select-none items-center gap-1 rounded-control border border-border/80 bg-background/80 px-1.5 font-sans text-caption font-medium text-muted-foreground"
        >
          Ctrl K
        </kbd>
      </div>
    </div>
  );
}

// The in-place search is part of the frame, but its ranking/grouping code is
// still a separate chunk. The placeholder is a real field so the first
// keystroke is captured and handed to the palette when the chunk arrives.
const CommandPalette = dynamic(
  () =>
    import("@/components/command-palette").then(
      (module) => module.CommandPalette,
    ),
  {
    loading: () => <CommandPalettePlaceholder />,
  },
);
const CheatsheetModal = dynamic(() =>
  import("@/components/shared/cheatsheet-modal").then(
    (module) => module.CheatsheetModal,
  ),
);

const FOCUSABLE_CONTENT =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/**
 * A scrolling region must be reachable by keyboard (axe
 * scrollable-region-focusable). #main-content stays tabindex -1, so the skip
 * link can focus it without a permanent tab stop, and joins the tab order only
 * while it overflows and holds nothing else focusable.
 */
function useScrollableMainTabStop(main: RefObject<HTMLElement | null>) {
  const [tabStop, setTabStop] = useState(false);
  useEffect(() => {
    const element = main.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        setTabStop(
          element.scrollHeight > element.clientHeight &&
            !element.querySelector(FOCUSABLE_CONTENT),
        ),
      );
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    const mutation = new MutationObserver(measure);
    mutation.observe(element, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [main]);
  return tabStop;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** Resolved on the server; decides which destinations the shell offers. */
  permissions?: readonly Phase2Action[] | null;
}

/**
 * SahelFlow desktop application frame.
 *
 * The shell keeps the semantic locale `dir` attribute for assistive technology
 * and DOM contracts. Internal.19's experience-system.css independently fixes the
 * outer flex coordinate system to physical LTR and explicitly orders navigation
 * and workspace regions, so semantic RTL never leaves sidebar placement to
 * inherited flex-direction behavior.
 *
 * Storefront authoring is a deliberate focus-mode exception. The first-run and
 * visual Studio routes already carry their own back navigation, save/publish
 * state, preview controls and editor panels, so duplicating the global sidebar
 * and topbar only steals canvas space and creates an "editor inside a dashboard"
 * hierarchy. Storefront list/history remain ordinary SahelFlow work surfaces.
 *
 * Locale and direction are consumed from the same reactive client authority as
 * translated copy. Server rendering still seeds that authority through the root
 * locale provider, but the shell never holds a stale server-only direction prop
 * after an interactive language switch.
 */
export function DashboardLayout({
  children,
  permissions = null,
}: DashboardLayoutProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const { cheatsheetOpen, setCheatsheetOpen } = useKeyboardShortcuts();
  const { t, locale, dir } = useI18n();
  const { density } = useUiDensity();
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const mainIsTabStop = useScrollableMainTabStop(mainRef);
  const storefrontFocusMode = /^\/storefronts\/[^/]+(?:\/studio)?\/?$/.test(
    pathname,
  );
  const storefrontFocusTitle = storefrontFocusMode
    ? pathname === "/storefronts/new"
      ? t("metadata.title.storefrontNew")
      : t("metadata.title.storefrontEdit")
    : null;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    root.dataset.density = density;

    const applyControlMetrics = () => {
      const isCoarse = coarsePointer.matches;
      root.style.setProperty(
        "--control-height",
        isCoarse
          ? "3rem"
          : density === "compact"
            ? "2.25rem"
            : "2.5rem",
      );
      root.style.setProperty("--sf-touch-target", isCoarse ? "3rem" : "0px");
    };

    applyControlMetrics();
    coarsePointer.addEventListener("change", applyControlMetrics);

    return () => {
      coarsePointer.removeEventListener("change", applyControlMetrics);
      if (root.dataset.density === density) delete root.dataset.density;
      root.style.removeProperty("--control-height");
      root.style.removeProperty("--sf-touch-target");
    };
  }, [density]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Match the PHYSICAL K key so the palette chord works on Arabic layouts,
      // where the physical K produces "ن" (audit d6 #4).
      if ((event.metaKey || event.ctrlKey) && matchPhysicalLetter(event, "k")) {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (storefrontFocusMode) return;
    // Start the chunk and the projection warmup with the shell. Waiting
    // left the first search cold and the first keystroke with nowhere to go.
    void import("@/components/command-palette");
    const timer = window.setTimeout(() => {
      void warmUniversalSearchClient().catch(() => {
        // Search remains lazy and self-healing if background projection warmup
        // fails. Never disturb the seller's current work surface for cache work.
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storefrontFocusMode]);

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
    <ActorAccessProvider permissions={permissions}>
      <div
        dir={dir}
        className="flex h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground"
        data-sahelflow-shell="desktop"
        data-shell-mode={storefrontFocusMode ? "storefront-focus" : "standard"}
        data-locale-dir={dir}
        data-density={density}
      >
        <a
          href="#main-content"
          dir={dir}
          className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[100] focus:rounded-control focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
        >
          {t("common.skipToContent")}
        </a>

        {!storefrontFocusMode ? (
          <div
            data-shell-region="navigation"
            dir={dir}
            className="hidden h-full min-h-0 shrink-0 lg:flex"
          >
            <Sidebar serverLocale={locale} serverDir={dir} />
          </div>
        ) : null}

        <div
          data-shell-region="workspace"
          dir={dir}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          {!storefrontFocusMode ? (
            <Topbar
              search={
                <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
              }
              onCommandPaletteOpen={() => setCommandOpen(true)}
              onCheatsheetOpen={() => setCheatsheetOpen(true)}
              serverLocale={locale}
              serverDir={dir}
            />
          ) : null}
          <main
            ref={mainRef}
            id="main-content"
            tabIndex={mainIsTabStop ? 0 : -1}
            dir={dir}
            className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scroll-pt-14 outline-none${
              mainIsTabStop ? " focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" : ""
            }`}
          >
            {storefrontFocusTitle ? (
              <h1 className="sr-only">{storefrontFocusTitle}</h1>
            ) : null}
            {children}
          </main>
        </div>

        {cheatsheetOpen && (
          <CheatsheetModal
            open={cheatsheetOpen}
            onOpenChange={setCheatsheetOpen}
          />
        )}
      </div>
    </ActorAccessProvider>
  );
}
