"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import {
  getWhatsAppIngressRecoveryTranslation,
  type WhatsAppIngressRecoveryKey,
} from "@/lib/i18n/whatsapp-ingress-recovery";
import { toast } from "@/lib/toast";

interface IngressAttempt {
  id: string;
  attemptNumber: number;
  state: string;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface IngressEvent {
  id: string;
  status: string;
  sourceId: string;
  providerEventId: string;
  providerTimestamp: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  attempts: IngressAttempt[];
}

const RECOVERY_STATES = new Set(["retrying", "quarantined", "dead_letter"]);

function contactFromJid(sourceId: string): string {
  return sourceId.split("@")[0]?.split(":")[0] ?? sourceId;
}

function dateText(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(new Date(value));
}

export function WhatsAppIngressRecoveryPanel() {
  const { locale } = useI18n();
  const tr = useCallback(
    (key: WhatsAppIngressRecoveryKey) =>
      getWhatsAppIngressRecoveryTranslation(locale, key),
    [locale],
  );
  const [events, setEvents] = useState<IngressEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/inbound?limit=50", {
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setAuthorized(false);
        return;
      }
      if (!response.ok) throw new Error("Failed to load ingress recovery");
      const data = (await response.json()) as { events?: IngressEvent[] };
      setEvents(Array.isArray(data.events) ? data.events : []);
      setAuthorized(true);
    } catch {
      // Inbox remains usable. The panel can be refreshed explicitly.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recoveryEvents = useMemo(
    () => events.filter((event) => RECOVERY_STATES.has(event.status)),
    [events],
  );

  const retry = async (event: IngressEvent) => {
    const reason = (reasons[event.id] ?? "").trim();
    if (reason.length < 3) return;
    setRetryingId(event.id);
    try {
      const response = await fetch("/api/whatsapp/inbound/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingressEventId: event.id, reason }),
      });
      if (!response.ok) throw new Error("Retry failed");
      const data = (await response.json()) as {
        result?: { state?: string };
      };
      toast.success(
        data.result?.state === "applied"
          ? tr("retrySucceeded")
          : tr("retryQueued"),
      );
      setReasons((current) => ({ ...current, [event.id]: "" }));
      await load();
    } catch {
      toast.error(tr("retryFailed"));
    } finally {
      setRetryingId(null);
    }
  };

  if (!authorized) return null;

  return (
    <Card className="border-warning/40" aria-live="polite">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {recoveryEvents.length > 0 ? (
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            )}
            {tr("title")}
          </CardTitle>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {tr("description")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
          {tr("refresh")}
        </Button>
      </CardHeader>
      <CardContent>
        {loading && events.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {tr("processing")}
          </div>
        ) : recoveryEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("noIssues")}</p>
        ) : (
          <div className="space-y-3">
            {recoveryEvents.map((event) => {
              const reason = reasons[event.id] ?? "";
              const retrying = retryingId === event.id;
              return (
                <section
                  key={event.id}
                  className="rounded-lg border bg-muted/20 p-4"
                  aria-labelledby={`ingress-${event.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong id={`ingress-${event.id}`} dir="ltr" className="font-mono text-sm">
                          {contactFromJid(event.sourceId) || tr("unknownContact")}
                        </strong>
                        <Badge variant={event.status === "dead_letter" ? "destructive" : "outline"}>
                          {tr(event.status as WhatsAppIngressRecoveryKey)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{tr("attempts")}: {event.attemptCount}</span>
                        <span>{dateText(event.providerTimestamp ?? event.createdAt, locale)}</span>
                        {event.lastErrorCode ? (
                          <span dir="ltr">{tr("lastError")}: {event.lastErrorCode}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-medium text-muted-foreground">
                      {tr("history")}
                    </summary>
                    <ol className="mt-2 space-y-1 ps-5 text-muted-foreground">
                      {event.attempts.map((attempt) => (
                        <li key={attempt.id}>
                          <span dir="ltr">#{attempt.attemptNumber}</span>
                          {" — "}{attempt.state}
                          {attempt.errorCode ? <span dir="ltr"> ({attempt.errorCode})</span> : null}
                          {" — "}{dateText(attempt.startedAt, locale)}
                        </li>
                      ))}
                    </ol>
                  </details>

                  <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor={`retry-reason-${event.id}`}>{tr("retryReason")}</Label>
                      <Input
                        id={`retry-reason-${event.id}`}
                        value={reason}
                        onChange={(input) =>
                          setReasons((current) => ({
                            ...current,
                            [event.id]: input.target.value,
                          }))
                        }
                        placeholder={tr("retryPlaceholder")}
                        maxLength={500}
                        disabled={retrying}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => void retry(event)}
                      disabled={retrying || reason.trim().length < 3}
                    >
                      {retrying ? (
                        <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <RotateCcw className="me-1.5 h-4 w-4" aria-hidden="true" />
                      )}
                      {retrying ? tr("retryingAction") : tr("retry")}
                    </Button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
