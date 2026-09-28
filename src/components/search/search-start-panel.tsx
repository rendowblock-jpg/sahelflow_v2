"use client";

import type * as React from "react";
import { History, Search } from "lucide-react";

import { IconTile } from "@/components/system";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { SearchCommandCopyKey } from "@/lib/i18n/search-command-center";

const GROUP_HEADING =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

interface QuickNavigationItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SearchStartPanelProps {
  copy: (key: SearchCommandCopyKey) => string;
  quickNavigation: readonly QuickNavigationItem[];
  recentSearches: readonly string[];
  onClearRecentSearches: () => void;
  onPickRecentSearch: (query: string) => void;
  onOpen: (href: string) => void;
  recentRows: React.ReactNode[];
  actionRows: React.ReactNode[];
}

/**
 * What the command center shows before the seller types: where they were
 * (recent searches and records), where they usually go (quick access) and what
 * they can start (create actions). Every entry is a keyboard-reachable item.
 */
export function SearchStartPanel({
  copy,
  quickNavigation,
  recentSearches,
  onClearRecentSearches,
  onPickRecentSearch,
  onOpen,
  recentRows,
  actionRows,
}: SearchStartPanelProps) {
  return (
    <>
      <div className="flex items-center gap-3 px-2.5 pb-2 pt-1">
        <IconTile icon={Search} tone="primary" size="sm" />
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-foreground">
            {copy("startTitle")}
          </p>
          <p className="truncate text-caption text-muted-foreground">
            {copy("startHint")}
          </p>
        </div>
      </div>

      {recentSearches.length > 0 ? (
        <div>
          <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
            <p className="text-caption font-medium text-muted-foreground">
              {copy("recentSearches")}
            </p>
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onClearRecentSearches}
              className="rounded-control px-1.5 text-caption text-muted-foreground hover:text-foreground"
            >
              {copy("clearRecentSearches")}
            </button>
          </div>
          <CommandGroup className="p-0">
            {recentSearches.map((entry) => (
              <CommandItem
                key={entry}
                value={`recent-search:${entry}`}
                onSelect={() => onPickRecentSearch(entry)}
                className="gap-3 rounded-control px-2.5 data-[selected=true]:bg-accent"
              >
                <IconTile icon={History} size="sm" />
                <bdi
                  dir="auto"
                  data-sf-seller-label="true"
                  className="block min-w-0 flex-1 truncate text-body-sm text-foreground"
                >
                  {entry}
                </bdi>
              </CommandItem>
            ))}
          </CommandGroup>
        </div>
      ) : null}

      {recentRows.length > 0 ? (
        <CommandGroup heading={copy("recentSection")} className={GROUP_HEADING}>
          {recentRows}
        </CommandGroup>
      ) : null}

      <CommandGroup
        heading={copy("quickAccess")}
        className={GROUP_HEADING}
        aria-description={copy("quickHint")}
      >
        <div className="grid grid-cols-2 gap-1">
          {quickNavigation.map((item) => (
            <CommandItem
              key={item.id}
              value={`quick-${item.id}`}
              onSelect={() => onOpen(item.href)}
              className="gap-3 rounded-control px-2.5 data-[selected=true]:bg-accent"
            >
              <IconTile icon={item.icon} size="sm" />
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-foreground">
                {item.label}
              </span>
            </CommandItem>
          ))}
        </div>
      </CommandGroup>

      {actionRows.length > 0 ? (
        <CommandGroup heading={copy("actionsSection")} className={GROUP_HEADING}>
          {actionRows}
        </CommandGroup>
      ) : null}
    </>
  );
}
