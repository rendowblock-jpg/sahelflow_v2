import * as React from "react";
import { AlertTriangle, Clock, Inbox, Loader2, WifiOff } from "lucide-react";

import { StateHeading } from "@/components/shared/state-heading";
import { cn } from "@/lib/utils";

export type StateSurfaceTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

/** `banner` is a thin full-width strip (saved data, offline). */
export type StateSurfaceSize = "inline" | "panel" | "page" | "banner";

/** The five states every list and page can be in. */
export type StateKind = "loading" | "empty" | "error" | "partial" | "offline";

const TONE_CLASSES: Record<
  StateSurfaceTone,
  { icon: string; frame: string }
> = {
  neutral: {
    icon: "border-border bg-muted text-muted-foreground",
    frame: "border-border/70 bg-background",
  },
  info: {
    icon: "border-primary/20 bg-primary-soft text-primary",
    frame: "border-primary/15 bg-primary-subtle",
  },
  success: {
    icon: "border-success/20 bg-success-soft text-success",
    frame: "border-success/15 bg-success-subtle",
  },
  warning: {
    icon: "border-warning/25 bg-warning-soft text-warning",
    frame: "border-warning/20 bg-warning-subtle",
  },
  danger: {
    icon: "border-destructive/20 bg-destructive-soft text-destructive",
    frame: "border-destructive/15 bg-destructive-subtle",
  },
};

const SIZE_CLASSES: Record<StateSurfaceSize, string> = {
  inline: "min-h-0 px-2.5 py-2",
  banner: "min-h-0 px-3 py-2",
  panel: "min-h-52 px-6 py-8",
  page: "min-h-[min(520px,60vh)] px-6 py-10",
};

type StateIcon = React.ComponentType<{ className?: string }>;

function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn(className, "animate-spin motion-reduce:animate-none")} />
  );
}

/**
 * What each kind means to assistive tech. Loading/partial/offline are polite
 * status messages; an error is an assertive alert; empty is static content.
 */
const KIND_DEFAULTS: Record<
  StateKind,
  {
    icon: StateIcon;
    tone: StateSurfaceTone;
    role?: React.AriaRole;
    live: "off" | "polite" | "assertive";
  }
> = {
  loading: { icon: Spinner, tone: "neutral", role: "status", live: "polite" },
  empty: { icon: Inbox, tone: "neutral", live: "off" },
  error: { icon: AlertTriangle, tone: "danger", role: "alert", live: "assertive" },
  partial: { icon: Clock, tone: "warning", role: "status", live: "polite" },
  offline: { icon: WifiOff, tone: "warning", role: "status", live: "polite" },
};

interface StateSurfaceProps {
  /** One of the five kinds; sets icon, tone, role and live region. */
  kind?: StateKind;
  icon?: StateIcon;
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
 * Shared state surface for loading/empty/error/partial/offline and the older
 * degraded/blocked/recovery experiences. Server-component safe: no hooks (the
 * localized wrapper is StateView, the focus handling is StateHeading).
 *
 * `inline` is a compact contextual notice and must never dominate a workbench.
 * It hugs its content up to a bounded reading width instead of becoming a
 * full-width alarm banner. `banner` is the same compact layout stretched to a
 * thin strip. `panel` and `page` remain centered recovery/empty-state
 * surfaces. Meaning comes from copy, semantic tone and available recovery actions
 * rather than decorative size or illustration.
 */
export function StateSurface({
  kind,
  icon,
  title,
  description,
  tone: toneProp,
  size: sizeProp,
  actions,
  details,
  className,
  role: roleProp,
  live: liveProp,
  testId,
}: StateSurfaceProps) {
  const defaults = kind ? KIND_DEFAULTS[kind] : undefined;
  const Icon = icon ?? defaults?.icon ?? Inbox;
  const tone = toneProp ?? defaults?.tone ?? "neutral";
  const size: StateSurfaceSize =
    sizeProp ?? (kind === "partial" || kind === "offline" ? "banner" : "panel");
  const role = roleProp ?? defaults?.role;
  const live = liveProp ?? defaults?.live ?? "off";
  const toneClasses = TONE_CLASSES[tone];
  const banner = size === "banner";
  // `inline` here means "compact layout": the notice and the banner share it.
  const inline = size === "inline" || banner;

  return (
    <section
      className={cn(
        "flex rounded-surface border",
        banner
          ? "w-full items-center justify-start"
          : inline
            ? "w-fit max-w-[min(100%,48rem)] self-start items-start justify-start"
            : "w-full items-center justify-center",
        SIZE_CLASSES[size],
        toneClasses.frame,
        className,
      )}
      role={role}
      aria-live={live}
      aria-busy={kind === "loading" ? true : undefined}
      data-testid={testId}
      data-state-kind={kind}
      data-state-tone={tone}
      data-state-size={size}
    >
      <div
        className={cn(
          "flex min-w-0",
          inline
            ? banner
              ? "w-full flex-row flex-wrap items-center gap-2.5 text-start"
              : "w-auto max-w-full flex-row items-start gap-2.5 text-start"
            : "w-full max-w-lg flex-col items-center text-center",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center border",
            inline ? "size-7 rounded-control" : "mb-4 size-11 rounded-surface",
            toneClasses.icon,
          )}
          aria-hidden="true"
        >
          <Icon className={inline ? "size-3.5" : "size-5"} />
        </div>

        <div
          className={cn(
            "min-w-0 flex-1",
            banner && "basis-48",
            inline ? "space-y-0.5" : "space-y-1.5",
          )}
        >
          <StateHeading
            as={banner ? "p" : "h2"}
            autoFocus={kind === "error"}
            className={cn(
              "font-semibold text-foreground",
              inline ? "text-[13px] leading-5" : "text-base",
            )}
          >
            {title}
          </StateHeading>
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
            <div className="mt-1.5 rounded-control border border-border/70 bg-muted/35 px-2.5 py-1.5 text-start text-xs text-muted-foreground">
              {details}
            </div>
          ) : null}
        </div>

        {actions && inline ? (
          <div
            className={cn(
              "ms-1 flex shrink-0 flex-wrap items-center gap-1.5 ps-1",
              banner && "ms-auto",
            )}
          >
            {actions}
          </div>
        ) : null}

        {details && !inline ? (
          <div className="mt-4 w-full rounded-control border border-border/70 bg-muted/35 px-3 py-2 text-start text-xs text-muted-foreground">
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
