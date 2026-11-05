import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/system";

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
  warning: "border-warning/20 bg-warning-subtle text-warning-ink",
  danger: "border-destructive/20 bg-destructive-subtle text-destructive-ink",
};

interface AttentionCenterProps {
  title: string;
  items: AttentionItem[];
  allClearLabel: string;
  /**
   * Item 1 (5 Nov 2026): the id of the ONE item that leads the page. While its count is above zero it is shown
   * large, once, with one primary action; the other counts stay as quiet rows beside it. Without it (or at zero)
   * the layout is the previous plain list.
   */
  leadId?: string;
  /** Text of the lead's one action (what opening the destination does). */
  leadActionLabel?: string;
  /** Small line above the lead figure ("Needs attention now"). */
  eyebrow?: string;
}

/**
 * Dashboard attention center.
 *
 * Home surfaces work requiring action before decorative analytics. Counts are
 * exact server facts supplied by their owning business services; zero-value rows
 * disappear so the seller sees a compact exception queue rather than a module
 * launcher.
 */
function AttentionRow({ item, quiet }: { item: AttentionItem; quiet?: boolean }) {
  const Icon = item.icon;
  const tone = item.tone ?? "neutral";
  return (
    <Link
      href={item.href}
      data-attention-row
      className="group flex min-h-12 items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-control border",
          TONE[quiet ? "neutral" : tone],
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.label}</span>
      <span
        className={cn(
          "tabular-nums",
          quiet ? "text-lg font-semibold text-muted-foreground" : "text-sm font-semibold text-foreground",
        )}
      >
        {item.value}
      </span>
      <ArrowRight
        className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export function AttentionCenter({
  title,
  items,
  allClearLabel,
  leadId,
  leadActionLabel,
  eyebrow,
}: AttentionCenterProps) {
  const active = items.filter((item) => item.value > 0);
  const lead = leadId === undefined ? undefined : active.find((item) => item.id === leadId);

  if (lead) {
    const rest = active.filter((item) => item.id !== lead.id);
    return (
      <section
        data-attention-center="true"
        aria-label={title}
        className="overflow-hidden rounded-surface border border-border bg-card text-card-foreground shadow-layer"
      >
        <div className={cn("grid", rest.length > 0 && "md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]")}>
          <div
            data-attention-lead
            className={cn(
              "flex min-w-0 flex-col p-5 md:p-6",
              rest.length > 0 && "border-b border-border/70 md:border-b-0 md:border-e",
            )}
          >
            {eyebrow ? (
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
                {eyebrow}
              </p>
            ) : null}
            <p
              data-attention-lead-figure
              className="mt-2 text-4xl font-semibold leading-none tracking-tight text-foreground tabular-nums md:text-5xl"
            >
              {lead.value}
            </p>
            <p className="mt-2 text-base font-medium text-foreground">{lead.label}</p>
            <div className="mt-5 flex">
              <Button asChild>
                <Link href={lead.href}>
                  {leadActionLabel ?? lead.label}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
          {rest.length > 0 ? (
            <div className="min-w-0 divide-y divide-border/70">
              {rest.map((item) => (
                <AttentionRow key={item.id} item={item} quiet />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section data-attention-center="true" className="rounded-control border border-border/80 bg-background">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {active.length > 0 ? (
          <span className="rounded-control bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {active.reduce((sum, item) => sum + item.value, 0)}
          </span>
        ) : null}
      </div>

      {active.length === 0 ? (
        <div className="flex items-center gap-2.5 px-3 py-4 text-sm text-muted-foreground">
          <IconTile icon={CheckCircle2} tone="success" size="sm" bordered />
          <span>{allClearLabel}</span>
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {active.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
