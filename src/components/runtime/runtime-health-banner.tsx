"use client";

import { RefreshCw, WifiOff, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { DESKTOP_RUNTIME_RECOVERED_EVENT } from "@/lib/runtime/desktop-recovery";

import { useRuntimeHealth } from "./use-runtime-health";

/**
 * A calm, app-wide note for when the local runtime does not answer: it says what
 * is happening, keeps trying by itself, offers Retry, and leaves when the
 * runtime holds steady. Nothing is shown while everything works.
 *
 * The seller can close it (button or Esc). Closed means "dismissed for this
 * episode": the monitor keeps it closed until things get worse or a new outage
 * starts, and a small icon stays so the problem is never hidden completely.
 *
 * Placement (F-0022): fixed at the TOP, directly under the topbar (h-14 below
 * lg, h-12 from lg), anchored to the inline END edge. The sidebar sits at the
 * inline START edge in both directions, toasts sit at the bottom end, and the
 * Inbox composer with its send button sits at the bottom at every width, so
 * the top edge under the topbar is the one band that none of them uses.
 * Logical properties only: end-*, never left/right.
 */
export function RuntimeHealthBanner() {
  const { t } = useI18n();
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const indicatorRef = useRef<HTMLButtonElement>(null);
  /** Where the keyboard goes after the seller opens or closes the notice. */
  const focusAfterToggle = useRef<"close" | "indicator" | null>(null);

  const onRecovered = useCallback(() => {
    // Reload what the failed requests left blank, and let any page error screen retry.
    router.refresh();
    window.dispatchEvent(new Event(DESKTOP_RUNTIME_RECOVERED_EVENT));
  }, [router]);

  const { state, retry, dismiss, reopen } = useRuntimeHealth(onRecovered);

  const dismissed = state.dismissed;
  useEffect(() => {
    const target = focusAfterToggle.current;
    focusAfterToggle.current = null;
    if (target === "indicator") indicatorRef.current?.focus();
    if (target === "close") closeRef.current?.focus();
  }, [dismissed]);

  if (state.status === "ok") return null;

  const offline = state.status === "offline";
  const Icon = offline ? WifiOff : RefreshCw;
  const title = t(offline ? "runtimeHealth.offline.title" : "runtimeHealth.reconnecting.title");

  if (dismissed) {
    return (
      <button
        ref={indicatorRef}
        type="button"
        data-testid="runtime-health-indicator"
        data-runtime-health={state.status}
        aria-label={`${title} - ${t("runtimeHealth.reopen")}`}
        title={title}
        onClick={() => {
          focusAfterToggle.current = "close";
          reopen();
        }}
        className="fixed end-3 top-14 z-50 inline-flex size-8 items-center justify-center rounded-full border border-border bg-popover text-warning shadow-popover outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon aria-hidden="true" className="size-4" />
      </button>
    );
  }

  const close = () => {
    focusAfterToggle.current = "indicator";
    dismiss();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    close();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="runtime-health-banner"
      data-runtime-health={state.status}
      onKeyDown={onKeyDown}
      className="fixed inset-x-3 top-14 z-50 flex flex-col gap-2 rounded-surface border border-border bg-popover p-3 text-popover-foreground shadow-popover sm:inset-x-auto sm:end-3 sm:max-w-sm"
    >
      <div className="flex items-start gap-2.5">
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-body-sm font-medium">{title}</p>
          <p className="text-caption text-muted-foreground">
            {t(offline ? "runtimeHealth.offline.body" : "runtimeHealth.reconnecting.body")}
          </p>
        </div>
        <Button
          ref={closeRef}
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0"
          aria-label={t("runtimeHealth.close")}
          onClick={close}
          data-testid="runtime-health-dismiss"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        disabled={state.retrying}
        onClick={retry}
        data-testid="runtime-health-retry"
      >
        {t(state.retrying ? "runtimeHealth.retrying" : "runtimeHealth.retry")}
      </Button>
    </div>
  );
}
