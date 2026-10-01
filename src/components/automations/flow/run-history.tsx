"use client";

import { CheckCircle2, ChevronDown, CircleDashed, Clock, MinusCircle, XCircle, type LucideIcon } from "lucide-react";
import { createElement } from "react";

import { useI18n } from "@/hooks/use-i18n";
import { getSellerActionSpec } from "@/lib/automations/catalog";
import type { AutomationRunSummary } from "@/lib/automations/automation-readiness";
import type { AutomationWorkspaceCopyKey } from "@/lib/i18n/automation-workspace";
import { cn, formatDateTime } from "@/lib/utils";

import { ActionGlyph, useAutomationCopy } from "./flow-visuals";

const QUEUED_LOOK = { icon: CircleDashed, tone: "text-muted-foreground bg-muted" };
const STATUS_LOOK: Record<string, { icon: LucideIcon; tone: string }> = {
  succeeded: { icon: CheckCircle2, tone: "text-success bg-success-soft" },
  partially_completed: { icon: MinusCircle, tone: "text-warning bg-warning-soft" },
  failed: { icon: XCircle, tone: "text-destructive bg-destructive-soft" },
  dead_letter: { icon: XCircle, tone: "text-destructive bg-destructive-soft" },
  ambiguous: { icon: MinusCircle, tone: "text-warning bg-warning-soft" },
  skipped: { icon: MinusCircle, tone: "text-muted-foreground bg-muted" },
  dry_run: { icon: CircleDashed, tone: "text-info bg-info-soft" },
  waiting: { icon: Clock, tone: "text-info bg-info-soft" },
  queued: { icon: CircleDashed, tone: "text-muted-foreground bg-muted" },
  running: { icon: CircleDashed, tone: "text-primary bg-primary-soft" },
};

function statusLabel(status: string, c: ReturnType<typeof useAutomationCopy>): string {
  const key = `run.status.${status}` as AutomationWorkspaceCopyKey;
  const label = c(key);
  return label && label !== key ? label : status;
}

/** A failure explained in the seller's words; unknown codes fall back to a generic line. */
function errorText(code: string | null, c: ReturnType<typeof useAutomationCopy>): string | null {
  if (!code) return null;
  const key = `run.error.${code}` as AutomationWorkspaceCopyKey;
  const text = c(key);
  return text && text !== key ? text : c("run.error.generic");
}

function StatusPill({ status }: { status: string }) {
  const c = useAutomationCopy();
  const look = STATUS_LOOK[status] ?? QUEUED_LOOK;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", look.tone)}>
      {createElement(look.icon, { className: "size-3", "aria-hidden": true })}
      {statusLabel(status, c)}
    </span>
  );
}

/** What this automation actually did, run by run and step by step. */
export function RunHistory({ runs }: { runs: readonly AutomationRunSummary[] }) {
  const { locale } = useI18n();
  const c = useAutomationCopy();

  if (runs.length === 0) {
    return (
      <p className="rounded-surface border border-dashed p-6 text-center text-body-sm leading-6 text-muted-foreground">
        {c("flow.noRuns")}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-automation-run-history="true">
      <p className="text-caption text-muted-foreground">{c("flow.runsHint")}</p>
      {runs.map((run, index) => (
        <details key={run.id} className="group rounded-surface border bg-card" open={index === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <StatusPill status={run.status} />
            <span className="min-w-0 flex-1 truncate text-caption tabular-nums text-muted-foreground">
              {formatDateTime(run.createdAt, locale)}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ol className="space-y-2 border-t px-3 py-3">
            {run.steps.map((step) => {
              const spec = getSellerActionSpec(step.action);
              const problem = step.status === "skipped" ? c("run.skippedByCheck") : errorText(step.errorCode, c);
              return (
                <li key={step.position} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-muted text-muted-foreground">
                    <ActionGlyph action={step.action} className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-body-sm font-medium">
                        {spec ? c(spec.copyKey as AutomationWorkspaceCopyKey) : step.action}
                      </span>
                      <StatusPill status={step.status} />
                    </span>
                    {problem && step.status !== "succeeded" ? (
                      <span className="mt-0.5 block text-caption leading-5 text-muted-foreground">{problem}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      ))}
    </div>
  );
}
