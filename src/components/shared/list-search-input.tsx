"use client";

/**
 * ListSearchInput — shared URL-driven scoped search field.
 *
 * The committed query lives in the `q` URL param (nuqs, shallow routing), so a
 * scoped search is shareable, survives reloads and works with back/forward —
 * the URL-as-state contract benchmarked from Linear/Shopify list surfaces.
 * Keystrokes are debounced (~300ms) and changing the scope resets `page` to 1
 * so the seller never lands on a page that no longer exists.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { useListSearchScope } from "@/hooks/use-list-search-scope";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

interface ListSearchInputProps {
  /** Placeholder / accessible name. Defaults to the shared "Search" copy. */
  placeholder?: string;
  /** Debounce window in milliseconds. */
  debounceMs?: number;
  className?: string;
}

export function ListSearchInput({
  placeholder,
  debounceMs = 300,
  className,
}: ListSearchInputProps) {
  const { t } = useI18n();
  const { q, setParams } = useListSearchScope();
  const [localValue, setLocalValue] = useState(q ?? "");
  const debouncedValue = useDebouncedValue(localValue, debounceMs);

  // `synced` is the query the box and the URL last agreed on: what this field
  // committed, or what it adopted from outside. `inFlight` holds the queries it
  // committed whose echo has not come back through `q` yet. Refs, not state:
  // they track the URL's conversation with the box and must never re-render.
  const synced = useRef(q ?? "");
  const inFlight = useRef(new Set<string>());

  const commit = useCallback(
    (next: string) => {
      if (next === synced.current) return;
      synced.current = next;
      inFlight.current.add(next);
      void setParams({ q: next || null, page: 1 });
    },
    [setParams],
  );

  // Seller -> URL: commit once the pause after typing has passed and the
  // debounce has caught up with the box.
  useEffect(() => {
    if (debouncedValue !== localValue) return;
    commit(debouncedValue.trim());
  }, [debouncedValue, localValue, commit]);

  // URL -> box: adopt a query that changed from OUTSIDE (clear-all chip,
  // back/forward). The URL echoing what this field just committed is not a
  // change: reading it back used to empty the box at the moment of the commit
  // and flip the URL again 300 ms later, in a loop (Internal.45 report).
  useEffect(() => {
    const external = q ?? "";
    if (inFlight.current.has(external)) {
      // Our own commit coming back; the newest one landing means none is left in flight.
      if (external === synced.current) inFlight.current.clear();
      return;
    }
    if (external === synced.current) return;
    synced.current = external;
    inFlight.current.clear();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: adopt external URL state (back/forward, clear-all)
    setLocalValue(external);
  }, [q]);

  function handleClear() {
    setLocalValue("");
    commit("");
  }

  const resolvedPlaceholder = placeholder ?? t("common.search");

  return (
    <div className={cn("relative min-w-0", className)}>
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
        placeholder={resolvedPlaceholder}
        aria-label={resolvedPlaceholder}
        // The field draws its own clear button; the browser's second one is switched off.
        className="ps-9 pe-8 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        autoComplete="off"
      />
      {localValue ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute end-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("common.clearSearch")}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
