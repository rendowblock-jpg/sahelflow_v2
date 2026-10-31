"use client";

import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "failed";

interface SaveStatusProps {
  state: SaveState;
  /** Already translated words for each state. */
  saving: string;
  saved: string;
  failed: string;
  className?: string;
}

/** Saving / saved / failed words beside the control (a live region, so a screen reader hears it). */
export function SaveStatus({ state, saving, saved, failed, className }: SaveStatusProps) {
  const text = state === "saving" ? saving : state === "saved" ? saved : state === "failed" ? failed : "";
  return (
    <p
      role="status"
      aria-live="polite"
      data-save-state={state}
      className={cn(
        "min-h-5 text-xs",
        state === "failed" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {text}
    </p>
  );
}
