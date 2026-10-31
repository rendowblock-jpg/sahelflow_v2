"use client";

import { AlertTriangle, Clock, Info, WifiOff } from "lucide-react";

import type { IngressNotice, IngressNoticeKind } from "@/hooks/inbox/use-inbox-ingress-health";
import type { Locale } from "@/lib/i18n";
import { getInboxHealthRuntimeTranslation } from "@/lib/i18n/inbox-health-runtime";
import { cn } from "@/lib/utils";

const ICONS = {
  lost: AlertTriangle,
  waiting: Clock,
  unreachable: WifiOff,
  unsupported: Info,
} satisfies Record<IngressNoticeKind, typeof Info>;

function fill(text: string, values: Record<string, number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ""));
}

function copyFor(locale: Locale, notice: IngressNotice): { title: string; hint: string } {
  const get = (key: string) => getInboxHealthRuntimeTranslation(locale, key) ?? "";
  if (notice.kind === "unreachable") {
    return { title: get("inboxHealth.unreachable.title"), hint: get("inboxHealth.unreachable.hint") };
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

/** Calm reception notices above the recovery dock. Plain text only; nothing from a customer. */
export function WhatsAppIngressHealthNotices({
  notices,
  locale,
  embedded = false,
}: {
  notices: IngressNotice[];
  locale: Locale;
  embedded?: boolean;
}) {
  if (notices.length === 0) return null;
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
        return (
          <div
            key={notice.kind}
            data-notice={notice.kind}
            className={cn(
              "flex min-h-10 items-start gap-2 rounded-surface border px-3 py-2 text-xs",
              soft ? "border-border bg-muted/40" : "border-warning/25 bg-warning-soft",
            )}
          >
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", soft ? "text-muted-foreground" : "text-warning")}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="font-medium text-foreground">{title}</p>
              <p className="mt-0.5 text-muted-foreground">{hint}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
