"use client";

import { useMemo, useState } from "react";
import { Bot, Search } from "lucide-react";

import { StateSurface } from "@/components/shared/state-surface";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { AutomationActions } from "./automation-actions";
import { AutomationCard, type AutomationCardData } from "./automation-card";
import { useAutomationCopy } from "./flow/flow-visuals";

type Filter = "all" | "on" | "off" | "repair";

/** The seller's automations: search, a status filter and one card each. */
export function AutomationsListClient({
  automations,
  canManage,
}: {
  automations: AutomationCardData[];
  canManage: boolean;
}) {
  const c = useAutomationCopy();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      all: automations.length,
      on: automations.filter((item) => item.isActive && !item.repairRequired).length,
      off: automations.filter((item) => !item.isActive && !item.repairRequired).length,
      repair: automations.filter((item) => item.repairRequired).length,
    }),
    [automations],
  );
  const needle = query.trim().toLocaleLowerCase();
  const visible = automations.filter((item) => {
    if (filter === "on" && !(item.isActive && !item.repairRequired)) return false;
    if (filter === "off" && !(!item.isActive && !item.repairRequired)) return false;
    if (filter === "repair" && !item.repairRequired) return false;
    if (!needle) return true;
    return (
      item.name.toLocaleLowerCase().includes(needle) ||
      item.triggerLabel.toLocaleLowerCase().includes(needle) ||
      item.actions.some((action) => action.label.toLocaleLowerCase().includes(needle))
    );
  });

  if (automations.length === 0) {
    return (
      <StateSurface
        icon={Bot}
        title={c("workspace.noAutomations")}
        description={c("workspace.noAutomationsHint")}
        actions={canManage ? <AutomationActions variant="create" /> : undefined}
        size="panel"
      />
    );
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: c("workspace.filterAll") },
    { id: "on", label: c("workspace.filterActive") },
    { id: "off", label: c("workspace.filterPaused") },
    ...(counts.repair > 0 ? [{ id: "repair" as const, label: c("workspace.filterRepair") }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={c("workspace.searchPlaceholder")}
            aria-label={c("workspace.searchPlaceholder")}
            className="ps-9"
          />
        </div>
        <div role="radiogroup" aria-label={c("workspace.filterAll")} className="flex rounded-control border bg-muted/40 p-0.5">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-3 text-caption font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                filter === item.id ? "bg-background text-foreground shadow-(--elevation-1)" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              <span className={cn("tabular-nums", item.id === "repair" ? "text-destructive" : "text-muted-foreground")}>
                {counts[item.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-surface border border-dashed py-12 text-center text-body-sm text-muted-foreground">
          {c("workspace.noMatch")}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((automation, index) => (
            <AutomationCard key={automation.id} data={automation} canManage={canManage} order={index} />
          ))}
        </div>
      )}
    </div>
  );
}
