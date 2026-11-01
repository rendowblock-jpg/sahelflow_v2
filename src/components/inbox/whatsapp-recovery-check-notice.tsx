"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { getInboxRecoveryCheckRuntimeTranslation } from "@/lib/i18n/inbox-recovery-check-runtime";
import { cn } from "@/lib/utils";

/**
 * Shown when the dock could not look for problem messages twice in a row.
 * Without it a failed look would be indistinguishable from "nothing to fix".
 */
export function WhatsAppRecoveryCheckNotice({
  locale,
  embedded = false,
  busy = false,
  onRetry,
}: {
  locale: Locale;
  embedded?: boolean;
  busy?: boolean;
  onRetry: () => void;
}) {
  const word = (key: string) => getInboxRecoveryCheckRuntimeTranslation(locale, key) ?? "";
  return (
    <div
      role="status"
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-testid="recovery-check-failed"
      className={cn(
        "flex min-h-10 items-start gap-2 rounded-surface border border-warning/25 bg-warning-soft px-3 py-2 text-xs",
        embedded && "order-last mb-2 basis-full",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{word("inboxRecoveryCheck.title")}</p>
        <p className="mt-0.5 text-muted-foreground">{word("inboxRecoveryCheck.hint")}</p>
      </div>
      <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={onRetry}>
        {word("inboxRecoveryCheck.again")}
      </Button>
    </div>
  );
}
