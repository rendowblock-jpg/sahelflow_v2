"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { AlertTriangle, ListFilter, Loader2, Plus, Search, SearchX, X } from "lucide-react";

import { flattenNavigationItems } from "@/components/layout/navigation";
import {
  CREATE_ACTIONS,
  GROUP_COPY,
  GROUP_PREVIEW_LIMIT,
  KIND_COPY,
  QUICK_NAV_IDS,
  RECORD_ICONS,
  groupResults,
  type SearchScope,
} from "@/components/search/search-palette-model";
import { SearchResultRow, type SearchRow } from "@/components/search/search-result-row";
import { SearchScopeBar } from "@/components/search/search-scope-bar";
import { SearchStartPanel } from "@/components/search/search-start-panel";
import { SearchStateMessage } from "@/components/search/search-state-message";
import { IconTile } from "@/components/system";
import { CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useI18n } from "@/hooks/use-i18n";
import { RECENT_RECORDS_VISIBLE, useRecentRecords } from "@/hooks/use-recent-records";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { useUniversalRecordSearch } from "@/hooks/use-universal-record-search";
import {
  searchCommandCopy,
  type SearchCommandCopyKey,
} from "@/lib/i18n/search-command-center";
import { warmUniversalSearchClient } from "@/lib/search/universal-search-client";
import {
  normalizeSearchText,
  rankUniversalSearchCandidates,
} from "@/lib/search/universal-search";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction?: (action: string) => void;
}

const GROUP_HEADING =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

/**
 * The SahelFlow command center, in place: the top-bar field IS the search. It
 * widens into a focused field and its results drop down directly beneath it —
 * no modal, no backdrop — so the page stays visible while the seller searches.
 * One place to find any record, page or action.
 *
 * Records come from the local-first universal authority (`/api/search`, via
 * `useUniversalRecordSearch`); pages, create actions and recents are ranked
 * locally by the same relevance authority (`rankUniversalSearchCandidates`),
 * so Arabic normalization applies to every row. Results are grouped by family
 * — the most relevant family first — and Tab scopes the palette to one family.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const copy = React.useCallback(
    (key: SearchCommandCopyKey) => searchCommandCopy(locale, key),
    [locale],
  );
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<SearchScope>("all");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const normalizedQuery = normalizeSearchText(query);
  const technicalQuery =
    normalizedQuery.length > 0 && /^[0-9\s()+\-./]+$/u.test(normalizedQuery);

  const recents = useRecentRecords(open);
  const recentSearches = useRecentSearches(open);
  const records = useUniversalRecordSearch(normalizedQuery, open);

  React.useEffect(() => {
    void warmUniversalSearchClient().catch(() => {
      // Warmup is latency preparation only; live search stays authoritative.
    });
  }, []);

  const createActionItems = React.useMemo<SearchRow[]>(
    () =>
      CREATE_ACTIONS.map((action) => ({
        id: action.id,
        kind: "action" as const,
        label: copy(action.labelKey),
        href: action.href,
        keywords: action.keywords,
        updatedAt: null,
        icon: Plus,
      })),
    [copy],
  );
  const visibleActions = React.useMemo<SearchRow[]>(
    () =>
      normalizedQuery
        ? rankUniversalSearchCandidates(normalizedQuery, createActionItems, createActionItems.length)
        : createActionItems,
    [createActionItems, normalizedQuery],
  );

  const recentItems = React.useMemo<SearchRow[]>(
    () =>
      recents.slice(0, RECENT_RECORDS_VISIBLE).map((record) => ({
        id: `${record.kind}:${record.id}`,
        kind: record.kind,
        label: record.label,
        href: record.href,
        updatedAt: record.viewedAt,
        icon: RECORD_ICONS[record.kind],
      })),
    [recents],
  );
  const visibleRecent = React.useMemo<SearchRow[]>(
    () =>
      normalizedQuery
        ? rankUniversalSearchCandidates(normalizedQuery, recentItems, recentItems.length)
        : recentItems,
    [recentItems, normalizedQuery],
  );
  const hasInstantMatches = visibleActions.length > 0 || visibleRecent.length > 0;

  const navigation = React.useMemo(
    () =>
      flattenNavigationItems().map((item) => ({
        ...item,
        kind: "navigation" as const,
        label: t(item.labelKey),
        sublabel: undefined,
        updatedAt: null,
      })),
    [t],
  );
  const quickNavigation = React.useMemo(
    () =>
      QUICK_NAV_IDS.map((id) => navigation.find((item) => item.id === id)).filter(
        (item): item is NonNullable<typeof item> => Boolean(item),
      ),
    [navigation],
  );
  const pageResults = React.useMemo(
    () =>
      normalizedQuery.length >= 2
        ? rankUniversalSearchCandidates(normalizedQuery, navigation, 8)
        : [],
    [navigation, normalizedQuery],
  );
  const recordResults = React.useMemo(
    () => records.results.map((result) => ({ ...result, icon: RECORD_ICONS[result.kind] })),
    [records.results],
  );
  const groups = React.useMemo(
    () => groupResults([...recordResults, ...pageResults]),
    [recordResults, pageResults],
  );

  const scopes = React.useMemo<SearchScope[]>(
    () => ["all", ...groups.map((group) => group.kind)],
    [groups],
  );
  const activeScope: SearchScope = scopes.includes(scope) ? scope : "all";
  const visibleGroups =
    activeScope === "all" ? groups : groups.filter((group) => group.kind === activeScope);
  const resultCount = groups.reduce((sum, group) => sum + group.rows.length, 0);

  const searching = normalizedQuery.length >= 2 && records.searching;
  const degraded = records.degradedFamilies.length > 0;
  const partiallyDegraded = degraded && resultCount > 0;
  const degradedEmpty =
    normalizedQuery.length > 0 && !searching && !records.failed && degraded && resultCount === 0;
  const noResults =
    normalizedQuery.length > 0 &&
    !searching &&
    !records.failed &&
    !degraded &&
    resultCount === 0 &&
    !hasInstantMatches;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setQuery("");
      setScope("all");
      inputRef.current?.blur();
    }
    onOpenChange(nextOpen);
  }

  function openHref(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  function openRow(row: SearchRow) {
    if (normalizedQuery.length >= 2 && row.kind !== "action") {
      recentSearches.remember(query);
    }
    openHref(row.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // First Escape clears a typed query; the second closes the results.
      if (query) setQuery("");
      else handleOpenChange(false);
      return;
    }
    if (event.key !== "Tab" || !normalizedQuery || scopes.length < 2) return;
    event.preventDefault();
    const index = scopes.indexOf(activeScope);
    const step = event.shiftKey ? -1 : 1;
    const next = scopes[(index + step + scopes.length) % scopes.length];
    if (next) setScope(next);
  }

  // Ctrl+K (owned by the shell) opens the field in place and focuses it.
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // A press anywhere outside the field and its results closes them — there is
  // no backdrop, so the page underneath stays visible and usable.
  React.useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setQuery("");
      setScope("all");
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [onOpenChange, open]);

  const renderRow = (item: SearchRow, showKind = false) => (
    <SearchResultRow
      key={`${item.kind}:${item.id}`}
      row={item}
      query={normalizedQuery}
      kindLabel={copy(KIND_COPY[item.kind])}
      openLabel={copy("open")}
      showKind={showKind}
      dimmed={records.stale && item.kind !== "navigation"}
      onSelect={openRow}
    />
  );
  const row = (item: SearchRow) => renderRow(item);
  const mixedRow = (item: SearchRow) => renderRow(item, true);

  return (
    <div
      ref={rootRef}
      data-universal-search="v2"
      data-command-trigger="true"
      data-search-open={open ? "true" : "false"}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={cn(
        "relative mx-auto min-w-0 max-w-xl flex-1",
        open
          ? "max-sm:fixed max-sm:inset-x-2 max-sm:top-2 max-sm:z-50 max-sm:block"
          : "hidden sm:block",
      )}
    >
      <CommandPrimitive
        shouldFilter={false}
        loop
        label={copy("title")}
        onKeyDown={handleKeyDown}
        className="w-full text-popover-foreground"
      >
        <div
          data-search-field="true"
          className={cn(
            "flex h-8 min-h-(--sf-touch-target) items-center gap-2 rounded-surface border px-2.5 transition-[background-color,border-color,box-shadow]",
            open
              ? "border-primary/40 bg-popover shadow-(--elevation-1) ring-3 ring-primary/10"
              : "border-border/80 bg-muted/30 hover:border-border hover:bg-muted/55",
          )}
        >
          {searching ? (
            <Loader2
              className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <CommandPrimitive.Input
            ref={inputRef}
            data-slot="command-input"
            dir={technicalQuery ? "ltr" : "auto"}
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              if (!open) onOpenChange(true);
            }}
            onFocus={() => {
              if (!open) onOpenChange(true);
            }}
            placeholder={copy("placeholder")}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-keyshortcuts="Control+K"
            className="h-full min-w-0 flex-1 bg-transparent text-body-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {open && query ? (
            <button
              type="button"
              aria-label={copy("clear")}
              title={copy("clear")}
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          ) : (
            <kbd
              dir="ltr"
              className="pointer-events-none inline-flex h-5 shrink-0 select-none items-center gap-1 rounded-control border border-border/80 bg-background/80 px-1.5 font-sans text-caption font-medium text-muted-foreground"
            >
              {open ? "Esc" : "Ctrl K"}
            </kbd>
          )}
        </div>

        {open ? (
          <div
            data-universal-search-panel="true"
            className={cn(
              "absolute start-1/2 top-full z-50 mt-2 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-surface border border-border bg-popover shadow-(--elevation-2) rtl:translate-x-1/2",
              "max-sm:static max-sm:w-full max-sm:translate-x-0 rtl:max-sm:translate-x-0",
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1",
            )}
          >
            {normalizedQuery && scopes.length > 1 ? (
              <SearchScopeBar
                scopes={scopes}
                active={activeScope}
                counts={Object.fromEntries(groups.map((group) => [group.kind, group.rows.length]))}
                total={resultCount}
                label={(value) => (value === "all" ? copy("scopeAll") : copy(GROUP_COPY[value]))}
                ariaLabel={copy("scopeLabel")}
                onChange={setScope}
              />
            ) : null}

            <CommandList className="max-h-[min(28rem,calc(100dvh-9rem))] scroll-py-2 px-2 py-2" aria-live="polite">
              {!normalizedQuery ? (
                <SearchStartPanel
                  copy={copy}
                  quickNavigation={quickNavigation}
                  recentSearches={recentSearches.entries}
                  onClearRecentSearches={recentSearches.clear}
                  onPickRecentSearch={setQuery}
                  onOpen={openHref}
                  recentRows={visibleRecent.map(mixedRow)}
                  actionRows={visibleActions.map(row)}
                />
              ) : null}

              {normalizedQuery && activeScope === "all" && visibleActions.length > 0 ? (
                <CommandGroup heading={copy("actionsSection")} className={GROUP_HEADING}>
                  {visibleActions.map(row)}
                </CommandGroup>
              ) : null}

              {normalizedQuery && activeScope === "all" && visibleRecent.length > 0 ? (
                <CommandGroup heading={copy("recentSection")} className={GROUP_HEADING}>
                  {visibleRecent.map(mixedRow)}
                </CommandGroup>
              ) : null}

              {partiallyDegraded ? (
                <p
                  className="mx-1 my-1 flex items-start gap-2 rounded-control bg-warning-subtle px-3 py-2 text-caption text-warning"
                  role="status"
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {copy("partialResults")}
                </p>
              ) : null}

              {visibleGroups.map((group) => {
                const preview = activeScope === "all" && group.rows.length > GROUP_PREVIEW_LIMIT;
                const rows = preview ? group.rows.slice(0, GROUP_PREVIEW_LIMIT) : group.rows;
                return (
                  <CommandGroup
                    key={group.kind}
                    heading={copy(GROUP_COPY[group.kind])}
                    className={GROUP_HEADING}
                  >
                    {rows.map(row)}
                    {preview ? (
                      <CommandItem
                        value={`show-all:${group.kind}`}
                        onSelect={() => setScope(group.kind)}
                        className="gap-3 rounded-control px-2.5 text-body-sm text-muted-foreground data-[selected=true]:bg-accent"
                      >
                        <IconTile icon={ListFilter} size="sm" />
                        {copy("showAll").replace("{count}", String(group.rows.length))}
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                );
              })}

              {searching && resultCount === 0 && !hasInstantMatches ? (
                <div className="space-y-1 px-1 py-1" role="status" aria-label={copy("searching")}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3 px-2.5 py-2">
                      <span className="size-8 shrink-0 animate-pulse rounded-control bg-muted motion-reduce:animate-none" />
                      <span className="h-3 flex-1 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
                    </div>
                  ))}
                </div>
              ) : null}

              {records.failed && resultCount === 0 ? (
                <SearchStateMessage icon={SearchX} title={copy("unavailable")} hint={copy("unavailableHint")} />
              ) : null}
              {degradedEmpty ? (
                <SearchStateMessage icon={AlertTriangle} tone="warning" title={copy("degradedTitle")} hint={copy("degradedHint")} />
              ) : null}
              {noResults ? (
                <SearchStateMessage icon={SearchX} title={copy("noResults")} hint={copy("noResultsHint")} />
              ) : null}
            </CommandList>

            <div className="flex h-9 items-center gap-4 border-t border-border px-4 text-caption text-muted-foreground">
              <KeyHint keys="↑↓" label={copy("navigate")} />
              <KeyHint keys="↵" label={copy("open")} />
              {normalizedQuery && scopes.length > 1 ? (
                <KeyHint keys="Tab" label={copy("filter")} />
              ) : null}
              <span className="ms-auto">
                <KeyHint keys="Esc" label={copy("close")} />
              </span>
            </div>
          </div>
        ) : null}
      </CommandPrimitive>
    </div>
  );
}

function KeyHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-control border border-border bg-muted px-1 font-sans text-caption text-muted-foreground">
        {keys}
      </kbd>
      {label}
    </span>
  );
}
