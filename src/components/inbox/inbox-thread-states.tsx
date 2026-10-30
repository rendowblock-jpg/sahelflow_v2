"use client";

import { SignalShape } from "@/components/inbox/inbox-signal-shape";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

/** Flat skeleton: grey slips that never move. */
export function InboxThreadLoading() {
  const { t } = useI18n();
  return (
    <div role="status" data-thread-state="loading" className="space-y-3 py-4">
      <span className="sr-only">{t("inbox.thread.state.loading")}</span>
      <div aria-hidden="true" className="h-11 w-3/5 rounded-[10px] bg-muted" />
      <div aria-hidden="true" className="ms-auto h-11 w-1/2 rounded-[10px] bg-muted" />
      <div aria-hidden="true" className="h-11 w-2/5 rounded-[10px] bg-muted" />
    </div>
  );
}

/** A blank page (ruled under Carnet). No steps are invented. */
export function InboxThreadEmpty() {
  const { t } = useI18n();
  return (
    <div
      data-thread-state="empty"
      className="carnet-ruled flex min-h-48 flex-col items-center justify-center gap-1 rounded-surface p-6 text-center"
    >
      <p className="text-body-sm font-semibold">{t("inbox.thread.state.empty.title")}</p>
      <p className="max-w-sm text-caption text-muted-foreground">{t("inbox.thread.state.empty.lead")}</p>
    </div>
  );
}

/** What failed and one way to try again. */
export function InboxThreadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      data-thread-state="error"
      className="flex flex-col items-center gap-2 rounded-surface border border-destructive/60 p-6 text-center"
    >
      <SignalShape shape="triangle" className="size-4" />
      <p className="text-body-sm font-semibold">{t("inbox.thread.state.error.title")}</p>
      <p className="text-caption text-muted-foreground">{t("inbox.thread.state.error.lead")}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="min-h-11 [@media(pointer:fine)]:min-h-8">
        {t("inbox.thread.state.error.retry")}
      </Button>
    </div>
  );
}
