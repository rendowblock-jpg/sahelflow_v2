"use client";

import { useEffect, useRef } from "react";
import { CornerDownLeft } from "lucide-react";

import type { AiQuickJob } from "@/components/ai/ai-quick-jobs";
import { cn } from "@/lib/utils";

/**
 * The composer's quick-jobs listbox ("/"). Rendering only — the composer owns
 * the query, the highlighted index and the keyboard (it keeps focus in the
 * text field, and points at the highlighted option with
 * aria-activedescendant, like any combobox).
 */
export function AiSlashMenu({
  id,
  title,
  emptyLabel,
  jobs,
  activeIndex,
  placement,
  onHover,
  onPick,
}: {
  id: string;
  title: string;
  emptyLabel: string;
  jobs: AiQuickJob[];
  activeIndex: number;
  placement: "above" | "below";
  onHover: (index: number) => void;
  onPick: (job: AiQuickJob) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div
      data-ai-slash-menu="true"
      className={cn(
        "absolute inset-x-0 z-30 overflow-hidden rounded-surface border border-border bg-popover text-popover-foreground shadow-(--elevation-3)",
        placement === "above" ? "bottom-full mb-2" : "top-full mt-2",
      )}
    >
      <p className="border-b border-border px-3 py-2 text-caption font-medium text-muted-foreground">
        {title}
      </p>
      <div
        ref={listRef}
        id={id}
        role="listbox"
        aria-label={title}
        className="max-h-72 overflow-y-auto p-1"
      >
        {jobs.length === 0 ? (
          <p className="px-3 py-3 text-body-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          jobs.map((job, index) => {
            const Icon = job.icon;
            const active = index === activeIndex;
            return (
              <div
                key={job.id}
                id={`${id}-${job.id}`}
                role="option"
                aria-selected={active}
                data-index={index}
                onMouseMove={() => onHover(index)}
                onMouseDown={(event) => {
                  // Keep focus in the composer; the pick happens on press.
                  event.preventDefault();
                  onPick(job);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-control px-2.5 py-2",
                  active ? "bg-accent text-accent-foreground" : "text-foreground",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-control border border-border bg-card">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-body-sm font-medium">{job.title}</span>
                    {job.count != null && job.count > 0 ? (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 text-caption font-semibold tabular-nums text-muted-foreground">
                        {job.count}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {job.description}
                  </span>
                </span>
                {active ? (
                  <CornerDownLeft
                    className="size-3.5 shrink-0 text-muted-foreground rtl:-scale-x-100"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
