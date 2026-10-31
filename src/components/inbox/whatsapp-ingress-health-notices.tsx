"use client";

import { AlertTriangle, Clock, Info, WifiOff } from "lucide-react";

import { acknowledgeUnsaved } from "@/hooks/inbox/ingress-health-store";
import type { IngressNotice, IngressNoticeKind } from "@/hooks/inbox/use-inbox-ingress-health";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { getInboxHealthRuntimeTranslation } from "@/lib/i18n/inbox-health-runtime";
import { getInboxHealthViewRuntimeTranslation } from "@/lib/i18n/inbox-health-view-runtime";
import { cn } from "@/lib/utils";

const ICONS = {
  lost: AlertTriangle,
  stalled: AlertTriangle,
  waiting: Clock,
  unreachable: WifiOff,
  unsupported: Info,
} satisfies Record<IngressNoticeKind, typeof Info>;

function fill(text: string, values: Record<string, number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ""));
}

function copyFor(locale: Locale, notice: IngressNotice): { title: string; hint: string } {
  const get = (key: string) =>
    getInboxHealthRuntimeTranslation(locale, key) ??
    getInboxHealthViewRuntimeTranslation(locale, key) ??
    "";
  if (notice.kind === "unreachable" || notice.kind === "stalled") {
    return { title: get(`inboxHealth.${notice.kind}.title`), hint: get(`inboxHealth.${notice.kind}.hint`) };
  }
  const title = fill(
    get(`inboxHealth.${notice.kind}.${notice.count === 1 ? "one" : "other"}`),
    { count: notice.count },
  );
  const age =
    notice.kind === "waiting" && notice.minutes !== null
      ? ` ${fill(get("inboxHealth.waiting.age"), { minutes: notice.minutes })}`
      : "";
  return { title, hint: `${get(`inboxHealth.${notice.kind}.hint`)}${age}` };
}

/**
 * Calm reception notices above the recovery dock. Plain text only; nothing from a customer.
 * Red = messages that could not be saved (stays until OK). Amber = waiting or stalled; a
 * stalled notice offers a Reconnect the seller presses (never done by itself).
 */
export function WhatsAppIngressHealthNotices({
  notices,
  locale,
  embedded = false,
  onReconnect,
}: {
  notices: IngressNotice[];
  locale: Locale;
  embedded?: boolean;
  onReconnect?: () => void;
}) {
  if (notices.length === 0) return null;
  const word = (key: string) => getInboxHealthViewRuntimeTranslation(locale, key) ?? "";
  return (
    <div
      role="status"
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-testid="ingress-health-notices"
      className={cn("space-y-2", embedded && "order-last mb-2 basis-full")}
    >
      {notices.map((notice) => {
        const Icon = ICONS[notice.kind];
        const { title, hint } = copyFor(locale, notice);
        const soft = notice.kind === "unsupported";
        const red = notice.kind === "lost";
        return (
          <div
            key={notice.kind}
            data-notice={notice.kind}
            data-severity={red ? "red" : soft ? "info" : "amber"}
            className={cn(
              "flex min-h-10 items-start gap-2 rounded-surface border px-3 py-2 text-xs",
              soft
                ? "border-border bg-muted/40"
                : red
                  ? "border-destructive/30 bg-destructive/10"
                  : "border-warning/25 bg-warning-soft",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                soft ? "text-muted-foreground" : red ? "text-destructive" : "text-warning",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{title}</p>
              <p className="mt-0.5 text-muted-foreground">{hint}</p>
            </div>
            {red ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => acknowledgeUnsaved(notice.count)}
              >
                {word("inboxHealth.ack")}
              </Button>
            ) : null}
            {notice.kind === "stalled" && onReconnect ? (
              <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onReconnect}>
                {word("inboxHealth.stalled.reconnect")}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
