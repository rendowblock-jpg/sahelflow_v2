"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CircleOff,
  CloudOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OperationalStateKind =
  | "loading"
  | "empty"
  | "permission"
  | "offline"
  | "stale"
  | "conflict"
  | "error"
  | "recovery";

interface StateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface OperationalStateProps {
  kind: OperationalStateKind;
  title: string;
  description: string;
  action?: StateAction;
  secondaryAction?: StateAction;
  /** Technical identifiers are rendered as isolated LTR content. */
  detail?: string;
  compact?: boolean;
  className?: string;
}

const STATE_META = {
  loading: { icon: Loader2, tone: "text-info", tile: "bg-info/10" },
  empty: { icon: CircleOff, tone: "text-muted-foreground", tile: "bg-muted" },
  permission: { icon: ShieldAlert, tone: "text-warning", tile: "bg-warning/10" },
  offline: { icon: CloudOff, tone: "text-warning", tile: "bg-warning/10" },
  stale: { icon: RefreshCw, tone: "text-warning", tile: "bg-warning/10" },
  conflict: { icon: Ban, tone: "text-destructive", tile: "bg-destructive/10" },
  error: { icon: AlertTriangle, tone: "text-destructive", tile: "bg-destructive/10" },
  recovery: { icon: RotateCcw, tone: "text-info", tile: "bg-info/10" },
} satisfies Record<OperationalStateKind, { icon: typeof Loader2; tone: string; tile: string }>;

function ActionButton({ action, secondary = false }: { action: StateAction; secondary?: boolean }) {
  if (action.href) {
    return (
      <Button asChild variant={secondary ? "outline" : "default"}>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={secondary ? "outline" : "default"}
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  );
}

/**
 * Shared surface for operational states that must remain explicit across every
 * route. Copy is supplied by the owning page so Arabic/French/English remain
 * semantic translations rather than concatenated fragments.
 */
export function OperationalState({
  kind,
  title,
  description,
  action,
  secondaryAction,
  detail,
  compact = false,
  className,
}: OperationalStateProps) {
  const meta = STATE_META[kind];
  const Icon = meta.icon;
  const urgent = kind === "error" || kind === "conflict";

  return (
    <section
      data-slot="operational-state"
      data-state={kind}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-busy={kind === "loading" || undefined}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center sm:p-8",
        compact ? "min-h-48" : "min-h-80",
        className,
      )}
    >
      <div className="flex max-w-md flex-col items-center gap-4">
        <div className={cn("flex size-12 items-center justify-center rounded-xl", meta.tile)}>
          <Icon className={cn("size-5", meta.tone, kind === "loading" && "animate-spin")} aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-balance text-lg font-semibold">{title}</h2>
          <p className="text-pretty text-sm text-muted-foreground">{description}</p>
          {detail && (
            <bdi dir="ltr" className="block break-all font-mono text-xs text-muted-foreground">
              {detail}
            </bdi>
          )}
        </div>
        {(action || secondaryAction) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {action && <ActionButton action={action} />}
            {secondaryAction && <ActionButton action={secondaryAction} secondary />}
          </div>
        )}
      </div>
    </section>
  );
}
