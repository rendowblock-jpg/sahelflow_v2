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

import { useEffect, useState } from "react";
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

  // Commit the debounced query once it matches what the seller finished
  // typing. Guarding on `debouncedValue === localValue` keeps a back/forward
  // navigation (URL q changed externally) from being overwritten by a stale
  // debounce that is still settling.
  useEffect(() => {
    if (debouncedValue !== localValue) return;
    const next = debouncedValue.trim() || null;
    if (next === (q ?? null)) return;
    void setParams({ q: next, page: 1 });
  }, [debouncedValue, localValue, q, setParams]);

  // Adopt external q changes (clear-all chips, back/forward) unless the value
  // plausibly originates from the seller's own in-flight typing.
  useEffect(() => {
    const external = q ?? "";
    if (external !== localValue && external !== debouncedValue) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: adopt external URL state (back/forward, clear-all)
      setLocalValue(external);
    }
  }, [q, localValue, debouncedValue]);

  function handleClear() {
    setLocalValue("");
    if (q !== null) {
      void setParams({ q: null, page: 1 });
    }
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
        className="ps-9 pe-8"
        autoComplete="off"
      />
      {localValue ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute end-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("common.clearSearch")}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
