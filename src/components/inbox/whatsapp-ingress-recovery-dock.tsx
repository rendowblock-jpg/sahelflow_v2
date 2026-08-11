"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
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
}

interface IngressEvent {
  id: string;
  status: string;
  sourceId: string;
  attemptCount: number;
  lastErrorCode: string | null;
  providerTimestamp: string | null;
  createdAt: string;
  attempts: IngressAttempt[];
}

const RECOVERY_STATES = new Set(["retrying", "quarantined", "dead_letter"]);
const RECOVERY_POLL_MS = 15_000;

function contactFromJid(sourceId: string): string {
  return sourceId.split("@")[0]?.split(":")[0] ?? sourceId;
}

export function WhatsAppIngressRecoveryDock({
  canRetry = false,
}: {
  canRetry?: boolean;
}) {
  const { locale } = useI18n();
  const copy = useCallback(
    (key: Parameters<typeof getInboxWorkspaceCopy>[1], params?: Record<string, string | number>) =>
      getInboxWorkspaceCopy(locale, key, params),
    [locale],
  );
  const tr = useCallback(
    (key: WhatsAppIngressRecoveryKey) =>
      getWhatsAppIngressRecoveryTranslation(locale, key),
    [locale],
  );
  const [events, setEvents] = useState<IngressEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/whatsapp/inbound?limit=50", {
        cache: "no-store",
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        setAuthorized(false);
        return;
      }
      if (!response.ok) throw new Error("Inbound recovery load failed");
      const data = (await response.json()) as { events?: IngressEvent[] };
      setEvents(Array.isArray(data.events) ? data.events : []);
      setAuthorized(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Recovery health is secondary to the usable canonical inbox.
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    const initialId = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load(controller.signal);
      }
    }, RECOVERY_POLL_MS);
    return () => {
      controller.abort();
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, [load]);

  const recoveryEvents = useMemo(
    () => events.filter((event) => RECOVERY_STATES.has(event.status)),
    [events],
  );

  const retry = async (event: IngressEvent) => {
    if (!canRetry) return;
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
      await refresh();
    } catch {
      toast.error(tr("retryFailed"));
    } finally {
      setRetryingId(null);
    }
  };

  if (!authorized || (loading && events.length === 0)) return null;
  if (recoveryEvents.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div
        role="status"
        className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-warning/25 bg-warning/6 px-3 py-2"
      >
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <span className="font-medium text-foreground">
              {copy("recoveryIssues", { count: recoveryEvents.length })}
            </span>
            <span className="ms-2 hidden text-muted-foreground md:inline">
              {copy("recoveryDescription")}
            </span>
          </div>
        </div>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="shrink-0">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {copy("reviewRecovery")}
          </Button>
        </SheetTrigger>
      </div>

      <SheetContent
        side={locale === "ar" ? "left" : "right"}
        className="w-[min(440px,96vw)] p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b px-5 py-4 text-start">
          <div className="flex items-start justify-between gap-3 pe-8">
            <div>
              <SheetTitle>{copy("recoveryTitle")}</SheetTitle>
              <SheetDescription className="mt-1.5 leading-5">
                {copy("recoveryDescription")}
              </SheetDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void refresh()}
              disabled={loading}
              aria-label={tr("refresh")}
            >
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
            </Button>
          </div>
        </SheetHeader>

        <div className="h-[calc(100dvh-7rem)] overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {recoveryEvents.map((event) => {
              const reason = reasons[event.id] ?? "";
              const retrying = retryingId === event.id;
              return (
                <section key={event.id} className="rounded-lg border bg-muted/20 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong dir="ltr" className="truncate font-mono text-xs">
                          {contactFromJid(event.sourceId) || tr("unknownContact")}
                        </strong>
                        <Badge
                          variant={event.status === "dead_letter" ? "destructive" : "outline"}
                          className="text-[10px]"
                        >
                          {tr(event.status as WhatsAppIngressRecoveryKey)}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{copy("attempts")}: {event.attemptCount}</span>
                        {event.lastErrorCode ? (
                          <span dir="ltr">{copy("lastError")}: {event.lastErrorCode}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <details className="mt-3 text-xs">
                    <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground">
                      <History className="size-3.5" aria-hidden="true" />
                      {copy("history")}
                    </summary>
                    <ol className="mt-2 space-y-1.5 ps-5 text-[11px] text-muted-foreground">
                      {event.attempts.map((attempt) => (
                        <li key={attempt.id}>
                          <span dir="ltr">#{attempt.attemptNumber}</span>
                          {" · "}{attempt.state}
                          {attempt.errorCode ? <span dir="ltr"> · {attempt.errorCode}</span> : null}
                        </li>
                      ))}
                    </ol>
                  </details>

                  {canRetry ? (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      <Label htmlFor={`recovery-reason-${event.id}`} className="text-xs">
                        {copy("recoveryReason")}
                      </Label>
                      <div className="flex items-end gap-2">
                        <Input
                          id={`recovery-reason-${event.id}`}
                          value={reason}
                          onChange={(input) =>
                            setReasons((current) => ({
                              ...current,
                              [event.id]: input.target.value,
                            }))
                          }
                          placeholder={copy("recoveryReasonPlaceholder")}
                          maxLength={500}
                          disabled={retrying}
                          className="text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void retry(event)}
                          disabled={retrying || reason.trim().length < 3}
                          className="shrink-0"
                        >
                          {retrying ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <RotateCcw className="size-3.5" aria-hidden="true" />
                          )}
                          {copy("retry")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
