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
  inline: "min-h-28 px-4 py-5",
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
 * One persistent Phase 5 state surface for empty/degraded/blocked/error/recovery
 * experiences. It is deliberately restrained: state meaning comes from copy,
 * semantic tone and available recovery actions rather than illustration or
 * decorative gradients.
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

  return (
    <section
      className={cn(
        "flex w-full items-center justify-center rounded-lg border",
        SIZE_CLASSES[size],
        toneClasses.frame,
        className,
      )}
      role={role}
      aria-live={live}
      data-testid={testId}
      data-state-tone={tone}
    >
      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <div
          className={cn(
            "mb-4 flex size-11 items-center justify-center rounded-lg border",
            toneClasses.icon,
          )}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <div className="text-pretty text-sm leading-6 text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>

        {details ? (
          <div className="mt-4 w-full rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-start text-xs text-muted-foreground">
            {details}
          </div>
        ) : null}

        {actions ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}
