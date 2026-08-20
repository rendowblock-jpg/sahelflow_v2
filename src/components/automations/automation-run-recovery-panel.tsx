"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSellerActionSpec,
  getSellerTriggerSpec,
} from "@/lib/automations/catalog";
import {
  getAutomationWorkspaceCopy,
  type AutomationWorkspaceCopyKey,
} from "@/lib/i18n/automation-workspace";
import { toast } from "@/lib/toast";

interface AttemptHistory {
  id: string;
  attemptNumber: number;
  state: string;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface StepHistory {
  id: string;
  position: number;
  action: string;
  failurePolicy: string;
  status: string;
  attemptCount: number;
  operatorRetryCount: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  effectKey: string | null;
  effectState: string | null;
  attempts: AttemptHistory[];
}

export interface AutomationRunHistoryView {
  id: string;
  automationName: string;
  triggerType: string;
  status: string;
  stepCount: number;
  succeededStepCount: number;
  failedStepCount: number;
  skippedStepCount: number;
  operatorRetryCount: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  recoverable: boolean;
  recoveryBlockCode: string | null;
  steps: StepHistory[];
}

interface Props {
  initialRuns: AutomationRunHistoryView[];
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default";
  if (["failed", "dead_letter", "ambiguous"].includes(status)) {
    return "destructive";
  }
  if (["queued", "processing", "retrying", "waiting_effect"].includes(status)) {
    return "secondary";
  }
  return "outline";
}

function statusIcon(status: string) {
  if (status === "succeeded") {
    return <CheckCircle2 className="size-4 text-success" />;
  }
  if (["failed", "dead_letter", "ambiguous", "partially_completed"].includes(status)) {
    return <AlertTriangle className="size-4 text-destructive" />;
  }
  return <Clock3 className="size-4 text-muted-foreground" />;
}

export function AutomationRunRecoveryPanel({ initialRuns }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [retryingRun, setRetryingRun] = useState<string | null>(null);
  const c = (key: AutomationWorkspaceCopyKey) =>
    getAutomationWorkspaceCopy(locale, key);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const retryRun = async (runId: string) => {
    const reason = reasons[runId]?.trim() ?? "";
    if (reason.length < 3) {
      toast.error(t("automations.runtime.retryReasonRequired"));
      return;
    }
    setRetryingRun(runId);
    try {
      const response = await fetch("/api/automations/runs/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, reason }),
      });
      if (!response.ok) throw new Error("AUTOMATION_RETRY_FAILED");
      toast.success(t("automations.runtime.retryQueued"));
      setReasons((current) => ({ ...current, [runId]: "" }));
      router.refresh();
    } catch {
      toast.error(t("automations.runtime.retryFailed"));
    } finally {
      setRetryingRun(null);
    }
  };

  if (initialRuns.length === 0) {
    return (
      <Card className="border-border/70">
        <CardContent className="flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Activity className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{c("workspace.latest")}</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {c("workspace.noActivity")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{c("workspace.latest")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {c("workspace.engineDetail")}
          </p>
        </div>
      </div>

      {initialRuns.map((run) => {
        const isExpanded = expanded === run.id;
        const triggerSpec = getSellerTriggerSpec(run.triggerType);
        const triggerLabel = triggerSpec ? t(triggerSpec.labelKey) : run.triggerType;
        const needsAttention = [
          "failed",
          "dead_letter",
          "ambiguous",
          "partially_completed",
        ].includes(run.status);

        return (
          <Card key={run.id} className="overflow-hidden border-border/70">
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/30">
                    {statusIcon(run.status)}
                  </span>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{run.automationName}</h3>
                      <Badge variant={statusVariant(run.status)}>
                        {t(`automations.runtime.state.${run.status}`)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{triggerLabel}</span>
                      <span>·</span>
                      <span>{formatter.format(new Date(run.createdAt))}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-md bg-success/10 px-2 py-1 text-success">
                        {run.succeededStepCount} {t("automations.runtime.state.succeeded")}
                      </span>
                      {run.failedStepCount > 0 ? (
                        <span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">
                          {run.failedStepCount} {t("automations.runtime.state.failed")}
                        </span>
                      ) : null}
                      {run.skippedStepCount > 0 ? (
                        <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                          {run.skippedStepCount} {t("automations.runtime.state.skipped")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant={needsAttention ? "outline" : "ghost"}
                  size="sm"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : run.id)}
                >
                  {isExpanded ? (
                    <ChevronUp className="me-1.5 size-4" />
                  ) : (
                    <ChevronDown className="me-1.5 size-4" />
                  )}
                  {isExpanded ? c("workspace.hideDetails") : c("workspace.details")}
                </Button>
              </div>

              {run.nextAttemptAt ? (
                <div className="border-t border-border/60 bg-muted/15 px-4 py-2 text-xs text-muted-foreground">
                  {t("automations.runtime.nextAttempt")}: {formatter.format(new Date(run.nextAttemptAt))}
                </div>
              ) : null}

              {isExpanded ? (
                <div className="space-y-4 border-t border-border/60 bg-muted/10 p-4">
                  <div className="grid gap-2">
                    {run.steps.map((step) => {
                      const actionSpec = getSellerActionSpec(step.action);
                      const actionLabel = actionSpec
                        ? c(actionSpec.copyKey as AutomationWorkspaceCopyKey)
                        : step.action;
                      return (
                        <div
                          key={step.id}
                          className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                              {step.position + 1}
                            </span>
                            <div>
                              <p className="text-sm font-medium">{actionLabel}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {step.attemptCount} {t("automations.runtime.attempts")}
                              </p>
                            </div>
                          </div>
                          <Badge variant={statusVariant(step.status)}>
                            {t(`automations.runtime.state.${step.status}`)}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>

                  {run.recoverable ? (
                    <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
                      <div className="mb-3 flex items-start gap-2">
                        <RotateCcw className="mt-0.5 size-4 shrink-0 text-warning" />
                        <div>
                          <p className="text-sm font-medium">{c("workspace.retry")}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("automations.runtime.retryReasonRequired")}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={reasons[run.id] ?? ""}
                          onChange={(event) =>
                            setReasons((current) => ({
                              ...current,
                              [run.id]: event.target.value,
                            }))
                          }
                          maxLength={500}
                          placeholder={t("automations.runtime.retryReason")}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={retryingRun === run.id}
                          onClick={() => retryRun(run.id)}
                        >
                          <RotateCcw className="me-1.5 size-4" />
                          {c("workspace.retry")}
                        </Button>
                      </div>
                    </div>
                  ) : run.recoveryBlockCode && needsAttention ? (
                    <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background p-4 text-sm text-muted-foreground">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {run.recoveryBlockCode === "AUTOMATION_EFFECT_RECOVERY_REQUIRED" ||
                        run.recoveryBlockCode === "AUTOMATION_EFFECT_AMBIGUOUS"
                          ? t("automations.runtime.effectRecoveryRequired")
                          : t("automations.runtime.retryUnavailable")}
                      </span>
                    </div>
                  ) : null}

                  <details className="rounded-lg border border-border/60 bg-background p-3 text-xs">
                    <summary className="cursor-pointer font-medium text-muted-foreground">
                      {c("workspace.details")}
                    </summary>
                    <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                      {run.lastErrorCode ? (
                        <p dir="ltr" className="break-all font-mono text-destructive">
                          {run.lastErrorCode}
                        </p>
                      ) : null}
                      {run.steps.map((step) => (
                        <div key={`${step.id}-technical`} className="space-y-1 text-muted-foreground">
                          <p dir="ltr" className="font-mono">
                            step {step.position + 1}: {step.action} · {step.status}
                          </p>
                          {step.lastErrorCode ? (
                            <p dir="ltr" className="break-all font-mono text-destructive">
                              {step.lastErrorCode}
                            </p>
                          ) : null}
                          {step.effectKey ? (
                            <p dir="ltr" className="break-all font-mono">
                              effect: {step.effectKey}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
