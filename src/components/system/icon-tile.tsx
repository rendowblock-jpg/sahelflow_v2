import * as React from "react";

import { cn } from "@/lib/utils";

export type IconTileTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type IconTileSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * The tinted square that holds a lucide glyph.
 *
 * Before this primitive existed the same idea was hand-rolled across the
 * component tree at differing sizes, radii and one-off alpha tints. Tone now
 * resolves through the authorized tint tokens, so a tile tracks the active
 * theme preset and mode instead of pinning a literal alpha.
 *
 * SYS-08 note — the scale below is drawn from the call sites, not invented
 * ahead of them. The first version of this primitive offered size-7/size-9 on
 * the control radius and size-11 on the surface radius, and it was adopted
 * exactly zero times: no real tile had those proportions. Every hand-rolled
 * tile in the tree used size-6/8/9/10/11/12, and most sat on the surface radius
 * with no border at all. A primitive that does not fit its call sites does not
 * get adopted, it gets worked around — so the scale was corrected to the sizes
 * that actually occur and the border was made opt-in rather than mandatory.
 *
 * INTERFACE_SYSTEM.md §3 (radius), §4 (tints), §6 (primitive layer).
 */
const TONE_CLASSES: Record<IconTileTone, { tinted: string; bordered: string }> =
  {
    neutral: {
      tinted: "bg-muted text-muted-foreground",
      bordered: "border-border",
    },
    primary: {
      tinted: "bg-primary-soft text-primary",
      bordered: "border-primary/20",
    },
    success: {
      tinted: "bg-success-soft text-success",
      bordered: "border-success/20",
    },
    warning: {
      tinted: "bg-warning-soft text-warning",
      bordered: "border-warning/25",
    },
    danger: {
      tinted: "bg-destructive-soft text-destructive",
      bordered: "border-destructive/20",
    },
    info: { tinted: "bg-info-soft text-info", bordered: "border-info/20" },
  };

/**
 * Frame/glyph pairs. Radius follows §3: the small steps read as controls, the
 * larger ones as surfaces, which is how the call sites already used them.
 */
const SIZE_CLASSES: Record<IconTileSize, { frame: string; glyph: string }> = {
  xs: { frame: "size-6 rounded-control", glyph: "size-3.5" },
  sm: { frame: "size-8 rounded-control", glyph: "size-4" },
  md: { frame: "size-9 rounded-surface", glyph: "size-4" },
  lg: { frame: "size-10 rounded-surface", glyph: "size-5" },
  xl: { frame: "size-12 rounded-surface", glyph: "size-6" },
};

interface IconTileProps extends Omit<React.ComponentProps<"span">, "children"> {
  icon: React.ComponentType<{ className?: string }>;
  tone?: IconTileTone;
  size?: IconTileSize;
  /** Most tiles in the tree are borderless washes; opt in where one is wanted. */
  bordered?: boolean;
}

export function IconTile({
  icon: Icon,
  tone = "neutral",
  size = "md",
  bordered = false,
  className,
  ...props
}: IconTileProps) {
  const sizing = SIZE_CLASSES[size];
  const toneClasses = TONE_CLASSES[tone];
  return (
    <span
      data-slot="icon-tile"
      data-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        sizing.frame,
        toneClasses.tinted,
        bordered && `border ${toneClasses.bordered}`,
        className,
      )}
      {...props}
    >
      <Icon className={sizing.glyph} aria-hidden="true" />
    </span>
  );
}
