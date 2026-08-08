"use client";

import * as React from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

interface InfoHintProps {
  /** The hint content. Can be a string or rich JSX. */
  content: React.ReactNode;
  /** Accessible label for screen readers (localized when omitted). */
  label?: string;
  /** Visual icon size; the interactive target always remains at least 24px. */
  size?: "sm" | "md";
  /** Optional className for the trigger wrapper. */
  className?: string;
  /** Side the popover opens (default top). */
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Inline education affordance. The trigger is a real button and the explanatory
 * content is an interactive popover, so it remains available to keyboard and
 * touch users instead of existing only as hover text.
 */
export function InfoHint({
  content,
  label,
  size = "md",
  className,
  side = "top",
}: InfoHintProps) {
  const { t } = useI18n();
  const ariaLabel = label ?? t("common.moreInformation");
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors",
            "hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "cursor-help",
            className,
          )}
        >
          <Info className={iconSize} aria-hidden="true" />
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
