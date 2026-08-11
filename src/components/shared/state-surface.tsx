import * as React from "react";

import { cn } from "@/lib/utils";

export type StateSurfaceTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type StateSurfaceSize = "inline" | "panel" | "page";

const TONE_CLASSES: Record<
  StateSurfaceTone,
  { icon: string; frame: string }
> = {
  neutral: {
    icon: "border-border bg-muted text-muted-foreground",
    frame: "border-border/70 bg-background",
  },
  info: {
    icon: "border-primary/20 bg-primary/10 text-primary",
    frame: "border-primary/15 bg-primary/[0.025]",
  },
  success: {
    icon: "border-success/20 bg-success/10 text-success",
    frame: "border-success/15 bg-success/[0.025]",
  },
  warning: {
    icon: "border-warning/25 bg-warning/10 text-warning",
    frame: "border-warning/20 bg-warning/[0.025]",
  },
  danger: {
    icon: "border-destructive/20 bg-destructive/10 text-destructive",
    frame: "border-destructive/15 bg-destructive/[0.025]",
  },
};

const SIZE_CLASSES: Record<StateSurfaceSize, string> = {
  inline: "min-h-0 px-2.5 py-2",
  panel: "min-h-52 px-6 py-8",
  page: "min-h-[min(520px,60vh)] px-6 py-10",
};

type StateIcon = React.ComponentType<{ className?: string }>;

interface StateSurfaceProps {
  icon: StateIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: StateSurfaceTone;
  size?: StateSurfaceSize;
  actions?: React.ReactNode;
  details?: React.ReactNode;
  className?: string;
  role?: React.AriaRole;
  live?: "off" | "polite" | "assertive";
  testId?: string;
}

/**
 * Shared state surface for empty/degraded/blocked/error/recovery experiences.
 *
 * `inline` is a compact contextual notice and must never dominate a workbench.
 * It hugs its content up to a bounded reading width instead of becoming a
 * full-width alarm banner. `panel` and `page` remain centered recovery/empty-state
 * surfaces. Meaning comes from copy, semantic tone and available recovery actions
 * rather than decorative size or illustration.
 */
export function StateSurface({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  size = "panel",
  actions,
  details,
  className,
  role,
  live = "off",
  testId,
}: StateSurfaceProps) {
  const toneClasses = TONE_CLASSES[tone];
  const inline = size === "inline";

  return (
    <section
      className={cn(
        "flex rounded-lg border",
        inline
          ? "w-fit max-w-[min(100%,48rem)] self-start items-start justify-start"
          : "w-full items-center justify-center",
        SIZE_CLASSES[size],
        toneClasses.frame,
        className,
      )}
      role={role}
      aria-live={live}
      data-testid={testId}
      data-state-tone={tone}
      data-state-size={size}
    >
      <div
        className={cn(
          "flex min-w-0",
          inline
            ? "w-auto max-w-full flex-row items-start gap-2.5 text-start"
            : "w-full max-w-lg flex-col items-center text-center",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center border",
            inline ? "size-7 rounded-md" : "mb-4 size-11 rounded-lg",
            toneClasses.icon,
          )}
          aria-hidden="true"
        >
          <Icon className={inline ? "size-3.5" : "size-5"} />
        </div>

        <div
          className={cn(
            "min-w-0 flex-1",
            inline ? "space-y-0.5" : "space-y-1.5",
          )}
        >
          <h2
            className={cn(
              "font-semibold text-foreground",
              inline ? "text-[13px] leading-5" : "text-base",
            )}
          >
            {title}
          </h2>
          {description ? (
            <div
              className={cn(
                "text-pretty text-muted-foreground",
                inline ? "text-[13px] leading-5" : "text-sm leading-6",
              )}
            >
              {description}
            </div>
          ) : null}

          {details && inline ? (
            <div className="mt-1.5 rounded-md border border-border/70 bg-muted/35 px-2.5 py-1.5 text-start text-xs text-muted-foreground">
              {details}
            </div>
          ) : null}
        </div>

        {actions && inline ? (
          <div className="ms-1 flex shrink-0 flex-wrap items-center gap-1.5 ps-1">
            {actions}
          </div>
        ) : null}

        {details && !inline ? (
          <div className="mt-4 w-full rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-start text-xs text-muted-foreground">
            {details}
          </div>
        ) : null}

        {actions && !inline ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}
