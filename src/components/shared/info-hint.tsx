"use client";

import * as React from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface InfoHintProps {
  /** The hint content. Can be a string or rich JSX. */
  content: React.ReactNode;
  /** Accessible label for screen readers (defaults to "More information"). */
  label?: string;
  /** Icon size (default h-4 w-4). */
  size?: "sm" | "md";
  /** Optional className for the trigger wrapper. */
  className?: string;
  /** Side the popover opens (default top). */
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * InfoHint — inline education affordance (Phase 0 foundation).
 *
 * An info icon that opens a popover with explanatory text. The "what does
 * this mean?" affordance that top-tier apps put next to every stat label,
 * settings field, and risk/automation control.
 *
 * Usage:
 *   <InfoHint content={t("dashboard.revenueTooltip")} />
 *   <InfoHint content={<RichExplainer />} side="right" />
 *
 * Accessibility:
 *   - Trigger is a real <button> with aria-label
 *   - Popover content has role="tooltip" via Radix
 *   - Keyboard: focus trigger → Enter/Space opens → Esc closes
 */
export function InfoHint({
  content,
  label = "More information",
  size = "md",
  className,
  side = "top",
}: InfoHintProps) {
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors",
            "hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "cursor-help",
            className,
          )}
        >
          <Info className={iconSize} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="center"
        className="max-w-xs text-sm leading-relaxed text-muted-foreground"
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
