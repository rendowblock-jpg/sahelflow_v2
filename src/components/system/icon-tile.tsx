import * as React from "react";

import { cn } from "@/lib/utils";

export type IconTileTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type IconTileSize = "sm" | "md" | "lg";

/**
 * The bordered, tinted square that holds a lucide glyph.
 *
 * Before this primitive existed the same idea was hand-rolled 36 times across
 * the component tree at differing sizes, radii and one-off alpha tints
 * (`bg-primary-subtle`, `from-primary-strong`, `border-primary/15`, ...). Tone now
 * resolves through the authorized tint tokens, so a tile tracks the active
 * theme preset and mode instead of pinning a literal alpha.
 *
 * INTERFACE_SYSTEM.md §4 (tints), §6 (primitive layer).
 */
const TONE_CLASSES: Record<IconTileTone, string> = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  primary: "border-primary/20 bg-primary-soft text-primary",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  danger: "border-destructive/20 bg-destructive-soft text-destructive",
  info: "border-info/20 bg-info-soft text-info",
};

const SIZE_CLASSES: Record<IconTileSize, { frame: string; glyph: string }> = {
  sm: { frame: "size-7 rounded-control", glyph: "size-3.5" },
  md: { frame: "size-9 rounded-control", glyph: "size-4" },
  lg: { frame: "size-11 rounded-surface", glyph: "size-5" },
};

interface IconTileProps extends Omit<React.ComponentProps<"span">, "children"> {
  icon: React.ComponentType<{ className?: string }>;
  tone?: IconTileTone;
  size?: IconTileSize;
}

export function IconTile({
  icon: Icon,
  tone = "neutral",
  size = "md",
  className,
  ...props
}: IconTileProps) {
  const sizing = SIZE_CLASSES[size];
  return (
    <span
      data-slot="icon-tile"
      data-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border",
        sizing.frame,
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      <Icon className={sizing.glyph} aria-hidden="true" />
    </span>
  );
}
