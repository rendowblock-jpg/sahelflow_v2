"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { matchesComboboxQuery } from "./search-match";

export interface AsyncComboboxOption {
  id: string;
}

/** Live search state handed to the footer render prop. */
export interface AsyncComboboxFooterState {
  query: string;
  hasMatches: boolean;
  fetching: boolean;
}

export interface AsyncComboboxProps<T extends AsyncComboboxOption> {
  /** Trigger id — wired to the surrounding form Label via htmlFor. */
  id?: string;
  /** Currently selected option id (empty string = nothing selected). */
  value: string;
  options: T[];
  onSelect: (option: T) => void;
  /**
   * Remote search authority. Called with the trimmed, 300ms-debounced query
   * while the popover is open. Omit for a purely local combobox. Must be a
   * stable reference (module-level function or useCallback).
   */
  fetchOptions?: (query: string) => Promise<T[]>;
  /** Fields fed to the Arabic-normalized local filter of the initial rows. */
  searchFields: (option: T) => Array<string | null | undefined>;
  /** Trigger face: selected label, or null to render the placeholder. */
  renderTriggerLabel: (option: T | null) => ReactNode;
  renderOption: (option: T, selected: boolean) => ReactNode;
  isOptionDisabled?: (option: T) => boolean;
  /** Extra keyboard-reachable rows under the list (e.g. create affordance). */
  footer?: (state: AsyncComboboxFooterState) => ReactNode;
  /** Announced when the combined local+remote list is empty and idle. */
  emptyMessage: string;
  /** Live-region copy while the remote search is in flight. */
  searchingMessage: string;
  /** Copy for the degraded hint when the remote search errored. */
  searchFailedMessage?: string;
  placeholder: string;
  searchPlaceholder: string;
  /** Notified with every successful remote result page (catalog caching). */
  onQueryResults?: (options: T[]) => void;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  disabled?: boolean;
  className?: string;
  popoverClassName?: string;
}

const SKELETON_ROWS = 4;

/**
 * Generic searchable async combobox (Popover + cmdk Command).
 *
 * Replaces the catalog-dump Radix Selects: only the capped server-passed
 * `options` render initially; typing filters those rows locally with the
 * universal-search Arabic normalization and (when `fetchOptions` is given)
 * queries the remote search endpoint after a 300ms debounce. cmdk keeps
 * arrow/enter keyboard navigation; `shouldFilter` is disabled because
 * filtering is owned here — remote rows may match on phone/SKU fields that
 * do not literally contain the typed text.
 */
export function AsyncCombobox<T extends AsyncComboboxOption>({
  id,
  value,
  options,
  onSelect,
  fetchOptions,
  searchFields,
  renderTriggerLabel,
  renderOption,
  isOptionDisabled,
  footer,
  emptyMessage,
  searchingMessage,
  searchFailedMessage,
  placeholder,
  searchPlaceholder,
  onQueryResults,
  ariaInvalid,
  ariaDescribedBy,
  disabled,
  className,
  popoverClassName,
}: AsyncComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<T[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  // Remembers a remotely-selected row so the trigger keeps its label even
  // though it is not part of the server-passed initial slice.
  const [remembered, setRemembered] = useState<T | null>(null);

  const debouncedQuery = useDebouncedValue(query, 300);
  const trimmedQuery = query.trim();
  const trimmedDebounced = debouncedQuery.trim();

  // Remote search only while open, only for a non-empty debounced query.
  // Stale responses are ignored via the `active` flag; state updates happen
  // exclusively in async continuations (no synchronous setState in the body).
  useEffect(() => {
    if (!open || !fetchOptions || !trimmedDebounced) return;
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return undefined;
        setFetching(true);
        setFetchFailed(false);
        return fetchOptions(trimmedDebounced);
      })
      .then((results) => {
        if (!active || results === undefined) return;
        setRemote(results);
        setFetching(false);
        onQueryResults?.(results);
      })
      .catch(() => {
        if (!active) return;
        // Local filtering of the initial rows still works — degrade loudly.
        setRemote([]);
        setFetching(false);
        setFetchFailed(true);
      });
    return () => {
      active = false;
    };
    // fetchOptions/onQueryResults must be stable (useCallback) at call sites.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trimmedDebounced, fetchOptions]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setRemote([]);
      setFetching(false);
      setFetchFailed(false);
    }
  }

  function handleSelect(option: T) {
    setRemembered(option);
    onSelect(option);
    handleOpenChange(false);
  }

  const selectedOption = useMemo(() => {
    if (remembered && remembered.id === value) return remembered;
    return options.find((option) => option.id === value) ?? null;
  }, [remembered, value, options]);

  // Live typing filters BOTH the initial rows and the previous remote page
  // (normalized Arabic-insensitive contains), so stale remote rows drop out
  // as the query changes instead of lingering until the next response.
  const combined = useMemo(() => {
    if (!trimmedQuery) return options;
    const matches = (option: T) =>
      matchesComboboxQuery(trimmedQuery, searchFields(option));
    const localMatches = options.filter(matches);
    const localIds = new Set(localMatches.map((option) => option.id));
    return [
      ...localMatches,
      ...remote.filter((option) => !localIds.has(option.id) && matches(option)),
    ];
  }, [trimmedQuery, options, remote, searchFields]);

  const showSkeletons =
    fetching && trimmedDebounced !== "" && combined.length === 0;
  const showFetchError = fetchFailed && Boolean(trimmedQuery);

  return (
    <div className={cn("flex w-full flex-col", className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            disabled={disabled}
            data-testid="combobox-trigger"
            className="w-full justify-between font-normal"
          >
            <span className="min-w-0 truncate text-start">
              {renderTriggerLabel(selectedOption) ?? (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown
              className="ms-2 size-4 shrink-0 opacity-50"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn("w-(--radix-popover-trigger-width) p-0", popoverClassName)}
        >
          <Command shouldFilter={false} data-testid="combobox-command">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              data-testid="combobox-input"
            />
            <CommandList data-testid="combobox-list">
              {showSkeletons ? (
                <div
                  className="space-y-1 p-1"
                  role="status"
                  aria-label={searchingMessage}
                  data-testid="combobox-skeleton"
                >
                  {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                    <div
                      key={index}
                      aria-hidden="true"
                      className="flex min-h-10 animate-pulse items-center gap-3 rounded-sm bg-muted px-2 py-1.5"
                    >
                      <div className="h-3.5 w-1/3 rounded bg-muted-foreground/20" />
                      <div className="h-3.5 w-1/5 rounded bg-muted-foreground/10" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {combined.map((option) => {
                    const selected = option.id === value;
                    return (
                      <CommandItem
                        key={option.id}
                        value={option.id}
                        disabled={isOptionDisabled?.(option) ?? false}
                        onSelect={() => handleSelect(option)}
                        data-testid="combobox-option"
                      >
                        <span className="flex w-full items-start gap-2 text-start">
                          <Check
                            className={cn(
                              "mt-0.5 size-4 shrink-0",
                              selected ? "opacity-100" : "opacity-0",
                            )}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            {renderOption(option, selected)}
                          </span>
                        </span>
                      </CommandItem>
                    );
                  })}
                  <CommandEmpty
                    className="py-6 text-center text-sm text-muted-foreground"
                    data-testid="combobox-empty"
                  >
                    {emptyMessage}
                  </CommandEmpty>
                </>
              )}
            </CommandList>
            {showFetchError && searchFailedMessage ? (
              <p
                role="status"
                className="border-t px-3 py-2 text-xs text-warning"
                data-testid="combobox-fetch-error"
              >
                {searchFailedMessage}
              </p>
            ) : null}
            {footer ? (
              <div className="border-t">
                {footer({
                  query: trimmedQuery,
                  hasMatches: combined.length > 0,
                  fetching,
                })}
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
