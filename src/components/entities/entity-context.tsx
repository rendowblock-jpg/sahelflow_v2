"use client";

import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export type EntityKind =
  | "order"
  | "customer"
  | "product"
  | "delivery"
  | "return"
  | "conversation"
  | "settlement";

interface EntityLinkProps {
  href: string;
  label: ReactNode;
  secondary?: ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * Canonical relationship link. It is always a real link so keyboard,
 * context-menu, copy-link and browser/WebView navigation semantics remain native.
 */
export function EntityLink({
  href,
  label,
  secondary,
  className,
  compact = false,
}: EntityLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex min-w-0 items-center gap-1 rounded-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "text-xs" : "text-sm",
        className,
      )}
    >
      <span className="min-w-0 truncate font-medium">{label}</span>
      {secondary ? (
        <span className="truncate text-muted-foreground group-hover:text-current">
          {secondary}
        </span>
      ) : null}
    </Link>
  );
}

interface EntityPreviewProps {
  title: ReactNode;
  description?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Compact shared entity summary used inside inspectors and relationship panels. */
export function EntityPreview({
  title,
  description,
  metadata,
  actions,
  children,
  className,
}: EntityPreviewProps) {
  return (
    <Card className={cn("shadow-none", className)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">{title}</CardTitle>
            {description ? (
              <div className="mt-1 text-xs text-muted-foreground">{description}</div>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {metadata ? (
          <div className="text-xs text-muted-foreground">{metadata}</div>
        ) : null}
      </CardHeader>
      {children ? <CardContent className="pt-0">{children}</CardContent> : null}
    </Card>
  );
}

interface EntityInspectorProps {
  title: ReactNode;
  description?: ReactNode;
  trigger: ReactNode;
  fullHref?: string;
  fullLabel?: ReactNode;
  children: ReactNode;
}

/**
 * Context-preserving side inspector. The logical opening edge follows locale
 * direction; the trigger remains a real Radix trigger and focus restoration is
 * handled by the dialog primitive.
 */
export function EntityInspector({
  title,
  description,
  trigger,
  fullHref,
  fullLabel,
  children,
}: EntityInspectorProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="end"
        className="w-[min(92vw,30rem)] sm:max-w-[30rem]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {fullHref ? (
          <div className="border-t p-4">
            <Button asChild variant="outline" className="w-full">
              <Link href={fullHref}>
                {fullLabel ?? title}
                <ArrowUpRight className="ms-2 size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export interface EntityTimelineItem {
  id: string;
  title: ReactNode;
  timestamp?: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: "neutral" | "success" | "warning" | "danger";
}

const TONE_CLASS = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

/** Shared semantic history/timeline primitive for entity state and audit facts. */
export function EntityTimeline({ items }: { items: readonly EntityTimelineItem[] }) {
  const { t } = useI18n();

  return (
    <ol className="space-y-3" aria-label={t("common.timeline")}>
      {items.map((item) => {
        const Icon = item.icon ?? Clock3;
        const tone = item.tone ?? "neutral";
        return (
          <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
            <div
              className={cn(
                "mt-0.5 flex size-7 items-center justify-center rounded-full border",
                TONE_CLASS[tone],
              )}
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 border-b border-border/60 pb-3 last:border-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="text-sm font-medium">{item.title}</div>
                {item.timestamp ? (
                  <div className="text-xs text-muted-foreground">{item.timestamp}</div>
                ) : null}
              </div>
              {item.description ? (
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
