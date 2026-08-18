"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Hash,
  Loader2,
  MessageSquare,
  Package,
  RotateCcw,
  SearchX,
  Truck,
  Users,
} from "lucide-react";

import { flattenNavigationItems } from "@/components/layout/navigation";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";
import {
  searchCommandCopy,
  type SearchCommandCopyKey,
} from "@/lib/i18n/search-command-center";
import {
  normalizeSearchText,
  rankUniversalSearchCandidates,
  type UniversalSearchCandidate,
  type UniversalSearchKind,
} from "@/lib/search/universal-search";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction?: (action: string) => void;
}

type RecordKind = Exclude<UniversalSearchKind, "navigation" | "action">;

type ApiRecordResult = UniversalSearchCandidate & {
  kind: RecordKind;
  score: number;
};

interface SearchResponse {
  query: string;
  results: ApiRecordResult[];
  degradedFamilies: RecordKind[];
  tookMs: number;
}

interface RecordState {
  query: string;
  results: ApiRecordResult[];
  degradedFamilies: RecordKind[];
  searching: boolean;
  failed: boolean;
}

const EMPTY_RECORD_STATE: RecordState = {
  query: "",
  results: [],
  degradedFamilies: [],
  searching: false,
  failed: false,
};

const QUICK_NAV_IDS = [
  "home",
  "sell",
  "inbox",
  "products",
  "customers",
  "grow",
] as const;

const RECORD_ICONS = {
  order: Hash,
  customer: Users,
  product: Package,
  conversation: MessageSquare,
  delivery: Truck,
  return: RotateCcw,
} as const satisfies Record<
  RecordKind,
  React.ComponentType<{ className?: string }>
>;

const KIND_COPY: Record<UniversalSearchKind, SearchCommandCopyKey> = {
  navigation: "typePage",
  action: "typePage",
  order: "typeOrder",
  customer: "typeCustomer",
  product: "typeProduct",
  conversation: "typeConversation",
  delivery: "typeDelivery",
  return: "typeReturn",
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const copy = React.useCallback(
    (key: SearchCommandCopyKey) => searchCommandCopy(locale, key),
    [locale],
  );
  const [query, setQuery] = React.useState("");
  const [recordState, setRecordState] = React.useState<RecordState>(
    EMPTY_RECORD_STATE,
  );
  const normalizedQuery = normalizeSearchText(query);
  const technicalQuery =
    normalizedQuery.length > 0 && /^[0-9\s()+\-./]+$/u.test(normalizedQuery);

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

  const navigationMatches = React.useMemo(() => {
    if (!normalizedQuery) return [];
    return rankUniversalSearchCandidates(normalizedQuery, navigation, 8);
  }, [navigation, normalizedQuery]);

  const quickNavigation = React.useMemo(() => {
    return QUICK_NAV_IDS.map((id) =>
      navigation.find((item) => item.id === id),
    ).filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [navigation]);

  React.useEffect(() => {
    if (!open || normalizedQuery.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setRecordState({
        query: normalizedQuery,
        results: [],
        degradedFamilies: [],
        searching: true,
        failed: false,
      });

      void fetch(
        `/api/search?q=${encodeURIComponent(normalizedQuery)}&limit=16`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(`Search returned ${response.status}`);
          return (await response.json()) as SearchResponse;
        })
        .then((response) => {
          if (controller.signal.aborted) return;
          setRecordState({
            query: normalizedQuery,
            results: response.results,
            degradedFamilies: response.degradedFamilies ?? [],
            searching: false,
            failed: false,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setRecordState({
            query: normalizedQuery,
            results: [],
            degradedFamilies: [],
            searching: false,
            failed: true,
          });
        });
    }, 120);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, open]);

  const liveRecordState =
    recordState.query === normalizedQuery ? recordState : EMPTY_RECORD_STATE;

  const visibleResults = React.useMemo(() => {
    if (!normalizedQuery) return [];
    const records = liveRecordState.results.map((result) => ({
      ...result,
      icon: RECORD_ICONS[result.kind],
    }));
    const pages = navigationMatches.map((result) => ({
      ...result,
      icon: result.icon,
    }));
    return [...records, ...pages]
      .sort((left, right) => right.score - left.score)
      .slice(0, 18);
  }, [liveRecordState.results, navigationMatches, normalizedQuery]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (normalizeSearchText(value).length < 2) {
      setRecordState(EMPTY_RECORD_STATE);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setQuery("");
      setRecordState(EMPTY_RECORD_STATE);
    }
    onOpenChange(nextOpen);
  }

  function openHref(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  const waitingForRequest =
    normalizedQuery.length >= 2 && recordState.query !== normalizedQuery;
  const searching =
    normalizedQuery.length >= 2 &&
    (waitingForRequest || liveRecordState.searching);
  const degraded = liveRecordState.degradedFamilies.length > 0;
  const partiallyDegraded = degraded && visibleResults.length > 0;
  const degradedEmpty =
    normalizedQuery.length > 0 &&
    !searching &&
    !liveRecordState.failed &&
    degraded &&
    visibleResults.length === 0;
  const noResults =
    normalizedQuery.length > 0 &&
    !searching &&
    !liveRecordState.failed &&
    !degraded &&
    visibleResults.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-universal-search="v2"
        className="gap-0 overflow-hidden rounded-2xl border-border/80 bg-popover/98 p-0 shadow-[0_28px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:max-w-[44rem]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{copy("title")}</DialogTitle>

        <Command
          shouldFilter={false}
          className={cn(
            "rounded-2xl bg-transparent",
            "[&_[data-slot=command-input-wrapper]]:h-14 [&_[data-slot=command-input-wrapper]]:gap-3 [&_[data-slot=command-input-wrapper]]:border-border/70 [&_[data-slot=command-input-wrapper]]:px-4",
            "[&_[data-slot=command-input-wrapper]_svg]:size-[18px] [&_[data-slot=command-input-wrapper]_svg]:opacity-60",
            "[&_[cmdk-input]]:h-14 [&_[cmdk-input]]:text-[15px] [&_[cmdk-input]]:font-medium",
          )}
        >
          <div className="relative">
            <CommandInput
              autoFocus
              dir={technicalQuery ? "ltr" : "auto"}
              className="[unicode-bidi:plaintext]"
              placeholder={copy("placeholder")}
              value={query}
              onValueChange={handleQueryChange}
            />
            {searching ? (
              <Loader2
                className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary"
                aria-hidden="true"
              />
            ) : null}
          </div>

          <CommandList
            className="max-h-[min(34rem,68dvh)] px-2 py-2"
            aria-live="polite"
          >
            {!normalizedQuery ? (
              <>
                <div className="px-3 pb-2 pt-1">
                  <p className="text-sm font-semibold text-foreground">
                    {copy("startTitle")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {copy("startHint")}
                  </p>
                </div>
                <CommandGroup heading={copy("quickAccess")}>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {quickNavigation.map((item) => {
                      const Icon = item.icon;
                      return (
                        <CommandItem
                          key={item.id}
                          value={`quick-${item.id}`}
                          onSelect={() => openHref(item.href)}
                          className="min-h-12 rounded-xl px-3 py-2.5 data-[selected=true]:bg-accent/80"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/65 bg-background/70">
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {item.label}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </div>
                </CommandGroup>
              </>
            ) : null}

            {partiallyDegraded ? (
              <div
                className="mx-1 mb-2 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-[11px] leading-5 text-warning"
                role="status"
              >
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>{copy("partialResults")}</span>
              </div>
            ) : null}

            {normalizedQuery && visibleResults.length > 0 ? (
              <CommandGroup heading={copy("bestMatches")}>
                {visibleResults.map((result) => {
                  const Icon = result.icon;
                  return (
                    <CommandItem
                      key={result.id}
                      value={`${result.kind}:${result.id}:${result.label}`}
                      onSelect={() => openHref(result.href)}
                      className="min-h-[3.4rem] rounded-xl px-3 py-2.5 data-[selected=true]:bg-accent/85"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/65 bg-background/75 shadow-sm">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <bdi
                          dir="auto"
                          className="block truncate text-start text-[13px] font-semibold [unicode-bidi:plaintext]"
                        >
                          {result.label}
                        </bdi>
                        {result.sublabel ? (
                          <bdi
                            dir="auto"
                            className="mt-0.5 block truncate text-start text-[11px] leading-4 text-muted-foreground [unicode-bidi:plaintext]"
                          >
                            {result.sublabel}
                          </bdi>
                        ) : null}
                      </span>
                      <span className="ms-2 shrink-0 rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {copy(KIND_COPY[result.kind])}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {searching && visibleResults.length === 0 ? (
              <div
                className="flex min-h-40 flex-col items-center justify-center px-6 text-center"
                role="status"
              >
                <Loader2
                  className="size-5 animate-spin text-primary"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium">{copy("searching")}</p>
              </div>
            ) : null}

            {liveRecordState.failed && visibleResults.length === 0 ? (
              <div
                className="flex min-h-44 flex-col items-center justify-center px-6 text-center"
                role="status"
              >
                <SearchX
                  className="size-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold">
                  {copy("unavailable")}
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  {copy("unavailableHint")}
                </p>
              </div>
            ) : null}

            {degradedEmpty ? (
              <div
                className="flex min-h-44 flex-col items-center justify-center px-6 text-center"
                role="status"
              >
                <AlertTriangle
                  className="size-6 text-warning"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold">
                  {copy("degradedTitle")}
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  {copy("degradedHint")}
                </p>
              </div>
            ) : null}

            {noResults ? (
              <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
                <SearchX
                  className="size-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold">
                  {copy("noResults")}
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  {copy("noResultsHint")}
                </p>
              </div>
            ) : null}
          </CommandList>

          <div className="flex min-h-10 items-center gap-2 border-t border-border/70 bg-muted/15 px-3.5 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded-md border border-border/70 bg-background px-1.5 py-0.5 font-mono">
                ↑↓
              </kbd>
              {copy("navigate")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded-md border border-border/70 bg-background px-1.5 py-0.5 font-mono">
                ↵
              </kbd>
              {copy("open")}
            </span>
            <span className="ms-auto inline-flex items-center gap-1.5">
              <kbd className="rounded-md border border-border/70 bg-background px-1.5 py-0.5 font-mono">
                Esc
              </kbd>
              {copy("close")}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
