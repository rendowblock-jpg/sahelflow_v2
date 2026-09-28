"use client";

import type { SearchScope } from "@/components/search/search-palette-model";
import { cn } from "@/lib/utils";

interface SearchScopeBarProps {
  scopes: readonly SearchScope[];
  active: SearchScope;
  counts: Partial<Record<SearchScope, number>>;
  total: number;
  label: (scope: SearchScope) => string;
  ariaLabel: string;
  onChange: (scope: SearchScope) => void;
}

/**
 * Result-family filter under the search input. Only families that actually
 * have matches are offered, each with its count; Tab / Shift+Tab in the palette
 * cycles the same list, so the chips double as the keyboard map.
 */
export function SearchScopeBar({
  scopes,
  active,
  counts,
  total,
  label,
  ariaLabel,
  onChange,
}: SearchScopeBarProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-2"
    >
      {scopes.map((scope) => {
        const selected = scope === active;
        const count = scope === "all" ? total : (counts[scope] ?? 0);
        return (
          <button
            key={scope}
            type="button"
            tabIndex={-1}
            aria-pressed={selected}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(scope)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-caption transition-colors duration-150 motion-reduce:transition-none",
              selected
                ? "border-primary/30 bg-primary-soft font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label(scope)}
            <span dir="ltr" className="tabular-nums opacity-80">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
