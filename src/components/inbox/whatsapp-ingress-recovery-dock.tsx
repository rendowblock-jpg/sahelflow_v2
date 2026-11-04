"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, RefreshCw, RotateCcw } from "lucide-react";

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
} from "@/components/ui/sheet";
import { useInboxIngressHealth } from "@/hooks/inbox/use-inbox-ingress-health";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import {
  getWhatsAppIngressRecoveryTranslation,
  type WhatsAppIngressRecoveryKey,
} from "@/lib/i18n/whatsapp-ingress-recovery";
import {
  afterFailedCheck,
  checkFailed,
  RECOVERY_REQUEST_PATH,
  RECOVERY_STATUSES,
} from "@/lib/inbox/recovery-load";
import { toast } from "@/lib/toast";
import { InboxStatusStrip } from "./inbox-status-strip";

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

const RECOVERY_STATES = new Set<string>(RECOVERY_STATUSES);
const RECOVERY_POLL_MS = 15_000;

function contactFromJid(sourceId: string): string {
  return sourceId.split("@")[0]?.split(":")[0] ?? sourceId;
}

export function WhatsAppIngressRecoveryDock({
  canRetry = false,
  embedded = false,
  onReconnect,
  linkConnected,
}: {
  canRetry?: boolean;
  /** What the Reconnect button of a "stalled" notice does (the seller presses it). */
  onReconnect?: () => void;
  /** Part of the inbox link surface: takes its own line in the header row. */
  embedded?: boolean;
  /** The link's own verdict; a stalled notice is only shown while it is true (or unknown). */
  linkConnected?: boolean;
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
  const [failedChecks, setFailedChecks] = useState(0);
  const healthNotices = useInboxIngressHealth(linkConnected);
  const detailsRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(RECOVERY_REQUEST_PATH, {
        cache: "no-store",
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        setAuthorized(false);
        setFailedChecks(0);
        return;
      }
      if (!response.ok) throw new Error("Inbound recovery load failed");
      const data = (await response.json()) as { events?: IngressEvent[] };
      setEvents(Array.isArray(data.events) ? data.events : []);
      setAuthorized(true);
      setFailedChecks(0);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // The inbox stays usable, but a check that did not work must not look like "all clear".
      setFailedChecks(afterFailedCheck);
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

  // Not allowed to list events is not "nothing to report": the reception counts come from the status
  // answer, which needs less permission, so they stay. Everything the inbox says about reception is
  // ONE compact strip (waiting + age, recovery issues, lost, stalled, failed check); its Details
  // popover floats over the page. The recovery sheet below is opened from Details.
  const recoveryCount = authorized ? recoveryEvents.length : 0;
  const strip = (
    <InboxStatusStrip
      notices={healthNotices}
      recoveryCount={recoveryCount}
      checkFailed={checkFailed(failedChecks)}
      checkBusy={loading}
      locale={locale}
      embedded={embedded}
      onReconnect={onReconnect}
      onReviewRecovery={recoveryCount > 0 ? () => setOpen(true) : undefined}
      onCheckAgain={() => void refresh()}
      detailsRef={detailsRef}
    />
  );

  // Same tree whether or not there is anything to review, so Details keeps its state across a poll.
  return (
    <>
    {strip}
    {recoveryCount === 0 ? null : (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side={locale === "ar" ? "left" : "right"}
        className="w-[min(440px,96vw)] p-0 sm:max-w-none"
        onCloseAutoFocus={(event) => {
          // The sheet is opened from Details, which has closed by now: give the focus back to its button.
          event.preventDefault();
          detailsRef.current?.focus();
        }}
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
                <section key={event.id} className="rounded-surface border bg-muted/20 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong dir="ltr" className="truncate font-mono text-xs">
                          {contactFromJid(event.sourceId) || tr("unknownContact")}
                        </strong>
                        <Badge
                          variant={event.status === "dead_letter" ? "destructive" : "outline"}
                          className="text-caption"
                        >
                          {tr(event.status as WhatsAppIngressRecoveryKey)}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground">
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
                    <ol className="mt-2 space-y-1.5 ps-5 text-caption text-muted-foreground">
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
    )}
    </>
  );
}
