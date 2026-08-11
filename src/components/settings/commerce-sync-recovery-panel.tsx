"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";
import { toast } from "@/lib/toast";

interface CommerceAttemptHistory {
  id: string;
  attemptNumber: number;
  state: string;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface CommerceItemHistory {
  id: string;
  sourceOrderId: string;
  sourceRevision: string;
  status: string;
  outcome: string | null;
  canonicalOrderId: string | null;
  attemptCount: number;
  operatorRetryCount: number;
  lastErrorCode: string | null;
  nextAttemptAt: string | null;
  attempts: CommerceAttemptHistory[];
}

interface CommerceRunHistory {
  id: string;
  platform: string;
  status: string;
  pagesFetched: number;
  fetchComplete: boolean;
  hasMore: boolean;
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  attemptCount: number;
  operatorRetryCount: number;
  lastErrorCode: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  recoverable: boolean;
  recoveryBlockCode: string | null;
  items: CommerceItemHistory[];
}

type LoadState = "loading" | "ready" | "error";

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default";
  if (["dead_letter", "failed", "quarantined"].includes(status)) {
    return "destructive";
  }
  if (["queued", "fetching", "processing", "retrying"].includes(status)) {
    return "secondary";
  }
  return "outline";
}

async function fetchCommerceRuns(): Promise<CommerceRunHistory[]> {
  const response = await fetch("/api/integrations/sync/history?limit=20", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("COMMERCE_HISTORY_FAILED");
  const data = (await response.json()) as { runs?: CommerceRunHistory[] };
  return Array.isArray(data.runs) ? data.runs : [];
}

export function CommerceSyncRecoveryPanel() {
  const { t, locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const copy = (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
    getSettingsWorkspaceCopy(locale, key);
  const [runs, setRuns] = useState<CommerceRunHistory[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [retrying, setRetrying] = useState<string | null>(null);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const loadRuns = useCallback(async () => {
    setLoadState("loading");
    try {
      setRuns(await fetchCommerceRuns());
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRuns();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadRuns]);

  const retryRun = async (runId: string) => {
    const reason = reasons[runId]?.trim() ?? "";
    if (reason.length < 3) {
      toast.error(t("commerce.runtime.retryReasonRequired"));
      return;
    }
    setRetrying(runId);
    try {
      const response = await fetch("/api/integrations/sync/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, reason }),
      });
      if (!response.ok) throw new Error("COMMERCE_RETRY_FAILED");
      toast.success(t("commerce.runtime.retryQueued"));
      setReasons((current) => ({ ...current, [runId]: "" }));
      await loadRuns();
    } catch {
      toast.error(t("commerce.runtime.retryFailed"));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">
            {t("commerce.runtime.history")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("commerce.runtime.subtitle")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadState === "loading"}
          onClick={() => void loadRuns()}
        >
          <RefreshCw
            className={`size-4 ${loadState === "loading" ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {t("commerce.runtime.refresh")}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loadState === "loading" ? (
          <div className="flex items-center justify-center px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
            {copy("loading")}
          </div>
        ) : loadState === "error" ? (
          <div className="m-4 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-warning/25 bg-warning/5 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0 text-warning"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold">{copy("unavailable")}</p>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                  {copy("unavailableDescription")}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadRuns()}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {copy("retry")}
            </Button>
          </div>
        ) : runs.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {t("commerce.runtime.noRuns")}
          </p>
        ) : (
          <div className="divide-y">
            {runs.map((run) => {
              const isExpanded = expanded === run.id;
              return (
                <section
                  key={run.id}
                  className="p-4"
                  aria-labelledby={`commerce-run-${run.id}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          id={`commerce-run-${run.id}`}
                          className="font-medium capitalize"
                        >
                          {run.platform}
                        </h3>
                        <Badge variant={statusVariant(run.status)}>
                          {t(`commerce.runtime.state.${run.status}`)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatter.format(new Date(run.createdAt))} · {" "}
                        {t("commerce.runtime.pages")}: {run.pagesFetched}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("commerce.runtime.counts", {
                          fetched: run.fetchedCount,
                          created: run.createdCount,
                          updated: run.updatedCount,
                          skipped: run.skippedCount,
                          failed: run.failedCount,
                        })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={isExpanded}
                      aria-controls={`commerce-run-details-${run.id}`}
                      onClick={() => setExpanded(isExpanded ? null : run.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="size-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="size-4" aria-hidden="true" />
                      )}
                      {isExpanded
                        ? t("commerce.runtime.hideDetails")
                        : t("commerce.runtime.showDetails")}
                    </Button>
                  </div>

                  {run.nextAttemptAt ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("commerce.runtime.nextAttempt")}: {" "}
                      {formatter.format(new Date(run.nextAttemptAt))}
                    </p>
                  ) : null}

                  {run.recoverable ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={reasons[run.id] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [run.id]: event.target.value,
                          }))
                        }
                        maxLength={500}
                        aria-label={t("commerce.runtime.retryReason")}
                        placeholder={t("commerce.runtime.retryReason")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={retrying === run.id}
                        onClick={() => void retryRun(run.id)}
                      >
                        <RotateCcw className="size-4" aria-hidden="true" />
                        {t("commerce.runtime.retry")}
                      </Button>
                    </div>
                  ) : null}

                  {!run.recoverable &&
                  run.recoveryBlockCode &&
                  ["partially_completed", "dead_letter"].includes(run.status) ? (
                    <div className="mt-3 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                      <AlertTriangle
                        className="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span>
                        {run.recoveryBlockCode === "COMMERCE_WATERMARK_CONFLICT"
                          ? t("commerce.runtime.watermarkConflict")
                          : run.recoveryBlockCode ===
                              "COMMERCE_CREDENTIAL_CONTRACT_DRIFT"
                            ? t("commerce.runtime.credentialDrift")
                            : t("commerce.runtime.retryUnavailable")}
                      </span>
                    </div>
                  ) : null}

                  {isExpanded ? (
                    <div
                      id={`commerce-run-details-${run.id}`}
                      className="mt-4 space-y-3"
                    >
                      {run.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t("commerce.runtime.items")}: 0
                        </p>
                      ) : (
                        run.items.map((item) => (
                          <div key={item.id} className="rounded-md border p-3">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium">
                                {t("commerce.runtime.sourceOrder")}
                              </span>
                              <span dir="ltr" className="font-mono text-xs">
                                {item.sourceOrderId}
                              </span>
                              <Badge variant={statusVariant(item.status)}>
                                {t(`commerce.runtime.state.${item.status}`)}
                              </Badge>
                            </div>
                            {item.lastErrorCode ? (
                              <p
                                className="mt-2 text-xs text-destructive"
                                dir="ltr"
                              >
                                {item.lastErrorCode}
                              </p>
                            ) : null}
                            {item.attempts.length > 0 ? (
                              <div className="mt-3 space-y-1">
                                <p className="text-xs font-medium">
                                  {t("commerce.runtime.attempts")}
                                </p>
                                {item.attempts.map((attempt) => (
                                  <p
                                    key={attempt.id}
                                    className="text-xs text-muted-foreground"
                                  >
                                    #{attempt.attemptNumber} · {" "}
                                    {t(`commerce.runtime.state.${attempt.state}`)}
                                    {attempt.errorCode
                                      ? ` · ${attempt.errorCode}`
                                      : ""}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
