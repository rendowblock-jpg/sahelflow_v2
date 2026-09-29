"use client";

import { ChevronRight, Plug } from "lucide-react";

import { IconTile } from "@/components/system";
import {
  getConnectedAgentsCopy,
  type ConnectedAgentsLocale,
} from "@/lib/i18n/connected-agents";
import { cn } from "@/lib/utils";

/**
 * The pinned Agents-rail entry that opens the Connected agents surface in the
 * canvas. It lives in the rail, beside the work it relates to, instead of
 * adding a tab band above a workspace that already names itself.
 */
export function ConnectedAgentsRailEntry({
  locale,
  activeCount,
  selected,
  onOpen,
}: {
  locale: ConnectedAgentsLocale;
  activeCount: number;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="border-t border-sidebar-border p-2">
      <button
        type="button"
        data-connected-agents-entry="true"
        aria-current={selected ? "page" : undefined}
        onClick={onOpen}
        className={cn(
          "flex w-full min-w-0 items-center gap-2.5 rounded-surface px-2.5 py-2 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "bg-accent" : "hover:bg-muted/60",
        )}
      >
        <IconTile icon={Plug} tone={selected ? "primary" : "neutral"} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium text-foreground">
            {getConnectedAgentsCopy(locale, "railTitle")}
          </span>
          <span className="block truncate text-caption text-muted-foreground">
            {getConnectedAgentsCopy(locale, "railHint")}
          </span>
        </span>
        {activeCount > 0 ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 text-caption font-semibold tabular-nums text-muted-foreground">
            {activeCount}
          </span>
        ) : null}
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
