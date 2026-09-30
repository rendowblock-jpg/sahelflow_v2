"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Search, X } from "lucide-react";

import {
  resolveSettingsTarget,
  SETTINGS_PAGES,
  SETTINGS_SECTIONS,
  settingsPageMatches,
  type SettingsPage,
  type SettingsPageId,
  type SettingsWorkspaceAccess,
  type SettingsWorkspaceGroup,
} from "@/components/settings/settings-pages";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { useMobile } from "@/hooks/use-mobile";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceCopyKey,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";
import { cn } from "@/lib/utils";

import styles from "./settings-control-center.module.css";

export type { SettingsWorkspaceAccess, SettingsWorkspaceGroup };

type SettingsCopy = (key: SettingsWorkspaceCopyKey) => string;
type FocusIntent = "detail" | "directory" | null;

function SettingsDirectory({
  pages,
  active,
  copy,
  query,
  mobile,
  onSelect,
}: {
  pages: SettingsPage[];
  active: SettingsPageId;
  copy: SettingsCopy;
  query: string;
  mobile: boolean;
  onSelect: (page: SettingsPageId) => void;
}) {
  const matches = pages.filter((page) =>
    settingsPageMatches(page, `${copy(page.label)} ${copy(page.description)}`, query),
  );

  if (matches.length === 0) {
    return (
      <p className="px-2.5 py-6 text-body-sm text-muted-foreground">
        {copy("noSettingsMatch")}
      </p>
    );
  }

  return (
    <nav
      data-settings-directory="true"
      aria-label={copy("settingsTitle")}
      className="space-y-5"
    >
      {SETTINGS_SECTIONS.map((section) => {
        const entries = matches.filter((page) => page.section === section.id);
        if (entries.length === 0) return null;
        return (
          <div key={section.id} role="group" aria-labelledby={`settings-section-${section.id}`}>
            <p
              id={`settings-section-${section.id}`}
              className="px-2.5 pb-1.5 text-caption font-medium text-muted-foreground"
            >
              {copy(section.label)}
            </p>
            <div className="space-y-px">
              {entries.map((page) => {
                const Icon = page.icon;
                const selected = !mobile && active === page.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    data-settings-group={page.id}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => onSelect(page.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-control px-2.5 text-start outline-none transition-colors duration-150 motion-reduce:transition-none",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      mobile ? "min-h-12 py-2" : "h-8",
                      selected
                        ? "bg-accent font-medium text-foreground"
                        : "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        page.tone === "danger" ? "text-destructive" : selected ? "text-foreground" : "text-muted-foreground",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm">{copy(page.label)}</span>
                      {mobile ? (
                        <span className="block truncate text-caption text-muted-foreground">
                          {copy(page.description)}
                        </span>
                      ) : null}
                    </span>
                    {mobile ? (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Settings: one page per concern, grouped Account → Shop → Connections →
 * Data, with a search that filters the whole directory. Every page renders
 * the panel that owns its behaviour; this component owns the frame — the
 * directory, the page header, the reading column and the responsive
 * directory ⇄ page drill-in (with the breakpoint-owned focus handoff).
 */
export function SettingsWorkspace({
  integrations,
  access,
  initialGroup,
  variant = "page",
}: {
  integrations: Array<{ platform: string; status: string }>;
  access: SettingsWorkspaceAccess;
  /** A page id or a legacy group id (`?group=` deep links). */
  initialGroup?: string;
  /** `modal` fills the intercepted Settings modal instead of the page body. */
  variant?: "page" | "modal";
}) {
  const inModal = variant === "modal";
  const { locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const mobile = useMobile();
  const copy: SettingsCopy = (key) => getSettingsWorkspaceCopy(locale, key);
  const visiblePages = useMemo(
    () => SETTINGS_PAGES.filter((page) => page.visible(access)),
    [access],
  );
  const requested = resolveSettingsTarget(initialGroup);
  const initialPage =
    requested && visiblePages.some((page) => page.id === requested)
      ? requested
      : visiblePages[0]?.id ?? "profile";
  const [active, setActive] = useState<SettingsPageId>(initialPage);
  const [query, setQuery] = useState("");
  const [mobilePane, setMobilePane] = useState<"directory" | "detail">(
    requested ? "detail" : "directory",
  );
  const [focusHandoffRevision, setFocusHandoffRevision] = useState(0);
  const directoryRef = useRef<HTMLElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const focusIntentRef = useRef<FocusIntent>(null);
  const breakpointFocusSourceRef = useRef<HTMLElement | null>(null);

  const effectivePage =
    visiblePages.find((page) => page.id === active) ?? visiblePages[0] ?? SETTINGS_PAGES[0]!;
  const effectiveActive = effectivePage.id;
  const section = SETTINGS_SECTIONS.find((entry) => entry.id === effectivePage.section);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || media.matches) return;
      if (
        directoryRef.current?.contains(target) ||
        detailRef.current?.contains(target)
      ) {
        setMobilePane("detail");
      }
    };

    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) return;

      if (event.matches && directoryRef.current?.contains(activeElement)) {
        breakpointFocusSourceRef.current = activeElement;
        focusIntentRef.current = "detail";
        setMobilePane("detail");
        setFocusHandoffRevision((revision) => revision + 1);
        return;
      }

      if (!event.matches && backButtonRef.current?.contains(activeElement)) {
        breakpointFocusSourceRef.current = activeElement;
        focusIntentRef.current = "directory";
        setMobilePane("directory");
        setFocusHandoffRevision((revision) => revision + 1);
      }
    };

    document.addEventListener("focusin", handleFocusIn, true);
    media.addEventListener("change", handleBreakpointChange);
    return () => {
      document.removeEventListener("focusin", handleFocusIn, true);
      media.removeEventListener("change", handleBreakpointChange);
    };
  }, [effectiveActive]);

  useLayoutEffect(() => {
    const intent = focusIntentRef.current;
    if (!intent) return;

    const source = breakpointFocusSourceRef.current;
    const currentActive = document.activeElement;
    if (
      source &&
      currentActive !== source &&
      currentActive !== document.body
    ) {
      focusIntentRef.current = null;
      breakpointFocusSourceRef.current = null;
      return;
    }

    if (intent === "detail" && mobilePane === "detail") {
      detailHeadingRef.current?.focus();
      focusIntentRef.current = null;
      breakpointFocusSourceRef.current = null;
      return;
    }

    if (intent === "directory" && (!mobile || mobilePane === "directory")) {
      directoryRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-settings-group="${effectiveActive}"]`,
        )
        ?.focus();
      focusIntentRef.current = null;
      breakpointFocusSourceRef.current = null;
    }
  }, [effectiveActive, focusHandoffRevision, mobile, mobilePane]);

  const selectPage = (page: SettingsPageId) => {
    breakpointFocusSourceRef.current = null;
    setActive(page);
    setMobilePane("detail");
    scrollRef.current?.scrollTo({ top: 0 });
    if (mobile) focusIntentRef.current = "detail";
  };

  const returnToDirectory = () => {
    breakpointFocusSourceRef.current = null;
    focusIntentRef.current = "directory";
    setMobilePane("directory");
  };

  const openFirstMatch = () => {
    const first = visiblePages.find((page) =>
      settingsPageMatches(page, `${copy(page.label)} ${copy(page.description)}`, query),
    );
    if (first) selectPage(first.id);
  };

  return (
    <div
      data-settings-workspace="v2"
      data-settings-generation="class-aaa"
      data-settings-control-center="true"
      data-settings-layout={mobile ? "mobile" : "desktop"}
      data-settings-mobile-pane={mobile ? mobilePane : undefined}
      data-settings-variant={variant}
      className={cn(
        styles.controlCenter,
        "bg-background",
        inModal
          ? "h-full min-h-0 flex-1"
          : cn(
              // The full page stays flat (hairlines, no island radius).
              "border-y border-border/80",
              mobile ? "min-h-[calc(100dvh-9rem)]" : "h-[calc(100dvh-10.5rem)] min-h-[36rem]",
            ),
      )}
    >
      <div
        className={cn(
          "min-h-0 overflow-hidden",
          mobile
            ? inModal
              ? "h-full overflow-y-auto"
              : "min-h-[calc(100dvh-9rem)]"
            : "grid h-full md:grid-cols-[15.625rem_minmax(0,1fr)]",
        )}
      >
        <aside
          ref={directoryRef}
          className={cn(
            mobile
              ? mobilePane === "directory"
                ? "block px-3 py-4 sm:px-4"
                : "hidden"
              : "flex min-h-0 flex-col border-e border-border bg-sidebar",
          )}
        >
          <div className={cn("shrink-0", mobile ? "px-1 pb-3" : "px-3 pb-3 pt-4")}>
            {/* The full page already carries a "Settings" page header. */}
            {inModal ? (
              <p className={cn("mb-3 px-2.5 text-foreground", mobile ? "text-title-2" : "text-body font-semibold")}>
                {copy("settingsTitle")}
              </p>
            ) : null}
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    openFirstMatch();
                  }
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    event.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder={copy("searchSettings")}
                aria-label={copy("searchSettings")}
                data-settings-search="true"
                className="h-9 w-full rounded-control border border-border bg-card ps-8 pe-8 text-body-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  aria-label={copy("searchSettings")}
                  onClick={() => setQuery("")}
                  className="absolute end-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
          <div className={cn(!mobile && "min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1")}>
            <SettingsDirectory
              pages={visiblePages}
              active={effectiveActive}
              copy={copy}
              query={query}
              mobile={mobile}
              onSelect={selectPage}
            />
          </div>
        </aside>

        <section
          ref={detailRef}
          data-settings-group-panel={effectiveActive}
          data-settings-domain-canvas="true"
          aria-labelledby={`settings-control-center-${effectiveActive}`}
          className={cn(
            "min-w-0",
            mobile
              ? mobilePane === "detail"
                ? "block min-h-[calc(100dvh-9rem)]"
                : "hidden"
              : "flex min-h-0 flex-col",
          )}
        >
          {/* One persistent Back control across breakpoints: the focus
              handoff relies on the same element surviving a resize. */}
          <div
            className={
              mobile
                ? "sticky top-0 z-10 flex h-12 items-center gap-1 border-b border-border bg-background px-2"
                : "contents"
            }
          >
            <Button
              ref={backButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={copy("backToSettings")}
              aria-hidden={mobile ? undefined : true}
              tabIndex={mobile ? 0 : -1}
              className={cn(
                !mobile && "pointer-events-none absolute size-px overflow-hidden opacity-0",
              )}
              onClick={returnToDirectory}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
            {mobile ? (
              <span className="truncate text-body-sm font-medium">{copy("settingsTitle")}</span>
            ) : null}
          </div>

          <div ref={scrollRef} className={mobile ? undefined : "min-h-0 flex-1 overflow-y-auto"}>
            <div
              className={cn(
                "mx-auto w-full max-w-3xl",
                mobile ? "px-4 pb-10 pt-5" : cn("px-10 pb-16 pt-9", inModal && "pe-16"),
              )}
            >
              <header className="pb-6">
                {section ? (
                  <p className="text-caption font-medium text-muted-foreground">
                    {copy(section.label)}
                  </p>
                ) : null}
                <h2
                  ref={detailHeadingRef}
                  id={`settings-control-center-${effectiveActive}`}
                  data-settings-detail-heading="true"
                  tabIndex={-1}
                  className="mt-1 text-title-1 outline-none"
                >
                  {copy(effectivePage.label)}
                </h2>
                <p className="mt-1.5 max-w-prose text-body-sm text-muted-foreground">
                  {copy(effectivePage.description)}
                </p>
              </header>
              <div
                className={cn(
                  styles.stack,
                  "border-t border-border",
                  effectivePage.leadless && styles.leadless,
                )}
                data-settings-domain-stack={effectiveActive}
              >
                {effectivePage.render({ access, integrations })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
