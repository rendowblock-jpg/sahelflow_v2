import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

export interface AttentionItem {
  id: string;
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  tone?: "neutral" | "warning" | "danger";
}

const TONE: Record<NonNullable<AttentionItem["tone"]>, string> = {
  neutral: "border-border/70 bg-muted/20 text-muted-foreground",
  warning: "border-warning/20 bg-warning/5 text-warning",
  danger: "border-destructive/20 bg-destructive/5 text-destructive",
};

interface AttentionCenterProps {
  title: string;
  items: AttentionItem[];
  allClearLabel: string;
}

/**
 * Dashboard attention center.
 *
 * Home surfaces work requiring action before decorative analytics. Counts are
 * exact server facts supplied by their owning business services; zero-value rows
 * disappear so the seller sees a compact exception queue rather than a module
 * launcher.
 */
export function AttentionCenter({
  title,
  items,
  allClearLabel,
}: AttentionCenterProps) {
  const active = items.filter((item) => item.value > 0);

  return (
    <section className="rounded-md border border-border/80 bg-background">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {active.length > 0 ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {active.reduce((sum, item) => sum + item.value, 0)}
          </span>
        ) : null}
      </div>

      {active.length === 0 ? (
        <div className="flex items-center gap-2.5 px-3 py-4 text-sm text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-md border border-success/20 bg-success/5 text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
          </span>
          <span>{allClearLabel}</span>
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {active.map((item) => {
            const Icon = item.icon;
            const tone = item.tone ?? "neutral";
            return (
              <Link
                key={item.id}
                href={item.href}
                className="group flex min-h-12 items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md border",
                    TONE[tone],
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {item.label}
                </span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {item.value}
                </span>
                <ArrowRight
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
