"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, Filter, FlaskConical } from "lucide-react";

import { Sparkline } from "@/components/charts/sparkline";
import { useI18n } from "@/hooks/use-i18n";
import { cn, formatDate } from "@/lib/utils";

import { AutomationActions } from "./automation-actions";
import type { AutomationBuilderAutomation } from "./automation-builder";
import { ACTION_TONES, ActionGlyph, TriggerGlyph, useAutomationCopy } from "./flow/flow-visuals";

export interface AutomationCardData {
  id: string;
  name: string;
  isActive: boolean;
  dryRun: boolean;
  repairRequired: boolean;
  trigger: string;
  triggerLabel: string;
  conditionCount: number;
  actions: Array<{ action: string; label: string }>;
  lastRunAt: string | null;
  /** The flow sends WhatsApp but no number is connected right now. */
  whatsappBlocked: boolean;
  /** Has an "Update order status" step, which governed orders refuse. */
  statusStepGoverned: boolean;
  stats: {
    runs: number;
    successRate: number | null;
    attention: number;
    trend: Array<{ date: string; value: number }>;
  };
  /** The stored row, for pause/duplicate/delete. */
  raw: AutomationBuilderAutomation;
}

/** One automation: what starts it, what it does, and how it has been running. */
export function AutomationCard({ data, canManage, order = 0 }: { data: AutomationCardData; canManage: boolean; order?: number }) {
  const { locale } = useI18n();
  const c = useAutomationCopy();
  const visibleActions = data.actions.slice(0, 3);
  const hasTrend = data.stats.trend.some((point) => point.value > 0);
  const href = `/automations/${encodeURIComponent(data.id)}`;

  return (
    <article
      data-automation-card={data.id}
      style={{ ["--sf-i" as string]: Math.min(order, 8) }}
      className={cn(
        "sf-node-in group relative flex flex-col rounded-surface border bg-card transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-(--elevation-2)",
        data.repairRequired && "border-destructive/40",
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-control",
            data.isActive && !data.repairRequired ? "sf-live-ring bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <TriggerGlyph trigger={data.trigger} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body font-semibold leading-6">
            {canManage ? (
              <Link href={href} data-automation-edit={data.id} className="outline-none after:absolute after:inset-0 after:rounded-surface focus-visible:underline">
                <span dir="auto">{data.name}</span>
              </Link>
            ) : (
              <span dir="auto">{data.name}</span>
            )}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
            {data.repairRequired ? (
              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                {c("workspace.needsRepair")}
              </span>
            ) : (
              <span className={cn("inline-flex items-center gap-1.5 font-medium", data.isActive ? "text-success" : "")}>
                <span className={cn("size-1.5 rounded-full", data.isActive ? "bg-success" : "bg-muted-foreground/50")} aria-hidden="true" />
                {data.isActive ? c("flow.active") : c("workspace.filterPaused")}
              </span>
            )}
            {data.dryRun ? (
              <span className="inline-flex items-center gap-1 text-info">
                <FlaskConical className="size-3.5" aria-hidden="true" />
                {c("workspace.dryRun")}
              </span>
            ) : null}
            <span>{c("workspace.steps", { count: data.actions.length })}</span>
            {data.whatsappBlocked && !data.repairRequired ? (
              <span className="inline-flex items-center gap-1 font-medium text-warning" data-automation-whatsapp-blocked="true">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                {c("flow.waBadge")}
              </span>
            ) : null}
          </p>
        </div>
        {canManage ? (
          <div className="relative z-10 flex shrink-0 items-center gap-1">
            {data.repairRequired ? null : <AutomationActions variant="toggle" automation={data.raw} repairRequired={data.repairRequired} />}
            <AutomationActions variant="menu" automation={data.raw} repairRequired={data.repairRequired} />
          </div>
        ) : null}
      </div>

      {data.statusStepGoverned && !data.repairRequired ? (
        <p className="mx-4 mb-3 flex items-start gap-2 rounded-control bg-warning-subtle px-3 py-2 text-caption leading-5 text-muted-foreground" data-automation-status-governed="true">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          {c("workspace.statusGovernedHint")}
        </p>
      ) : null}

      {data.repairRequired ? (
        <p className="mx-4 mb-3 rounded-control bg-destructive-subtle px-3 py-2 text-caption leading-5 text-muted-foreground">
          {c("workspace.repairHint")}
        </p>
      ) : null}

      <div className="mx-4 mb-4 flex flex-wrap items-center gap-1.5 text-caption" aria-label={`${c("workspace.when")} ${data.triggerLabel}`}>
        <FlowChip tone="bg-primary-subtle text-primary" icon={<TriggerGlyph trigger={data.trigger} className="size-3.5" />}>
          {data.triggerLabel}
        </FlowChip>
        <ArrowRight className="size-3 shrink-0 text-muted-foreground icon-rtl-flip" aria-hidden="true" />
        <FlowChip tone="bg-muted text-muted-foreground" icon={<Filter className="size-3.5" aria-hidden="true" />}>
          {data.conditionCount > 0 ? c("builder.conditionCount", { count: data.conditionCount }) : c("workspace.always")}
        </FlowChip>
        <ArrowRight className="size-3 shrink-0 text-muted-foreground icon-rtl-flip" aria-hidden="true" />
        {visibleActions.map(({ action, label }, index) => {
          return (
            <FlowChip key={`${action}-${index}`} tone={ACTION_TONES[action] ?? "bg-muted text-muted-foreground"} icon={<ActionGlyph action={action} className="size-3.5" />}>
              {label}
            </FlowChip>
          );
        })}
        {data.actions.length > visibleActions.length ? (
          <span className="text-muted-foreground">{c("workspace.andMore", { count: data.actions.length - visibleActions.length })}</span>
        ) : null}
      </div>

      <dl className="mt-auto grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-end gap-x-5 border-t px-4 py-3">
        <div>
          <dt className="text-caption text-muted-foreground">{c("workspace.runs30d")}</dt>
          <dd className="text-body font-semibold tabular-nums">{data.stats.runs}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">{c("workspace.success")}</dt>
          <dd
            className={cn(
              "text-body font-semibold tabular-nums",
              data.stats.successRate !== null && data.stats.successRate < 90 && "text-warning",
            )}
          >
            {data.stats.successRate === null ? "—" : `${data.stats.successRate}%`}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="sr-only">{c("workspace.lastRun")}</dt>
          <dd className="flex items-center gap-1 truncate text-caption text-muted-foreground">
            <Clock3 className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {data.lastRunAt ? `${c("workspace.lastRun")}: ${formatDate(data.lastRunAt, locale)}` : c("workspace.never")}
            </span>
          </dd>
        </div>
        <div className="w-20" aria-hidden="true">
          {hasTrend ? <Sparkline data={data.stats.trend} height={24} zeroBaseline /> : null}
        </div>
      </dl>
    </article>
  );
}

function FlowChip({ tone, icon, children }: { tone: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 font-medium", tone)}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
