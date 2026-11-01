"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { DESKTOP_RUNTIME_RECOVERED_EVENT } from "@/lib/runtime/desktop-recovery";

import { useRuntimeHealth } from "./use-runtime-health";

/**
 * A calm, app-wide note for when the local runtime does not answer: it says what
 * is happening, keeps trying by itself, offers Retry, and leaves when the
 * runtime holds steady. Nothing is shown while everything works.
 */
export function RuntimeHealthBanner() {
  const { t } = useI18n();
  const router = useRouter();

  const onRecovered = useCallback(() => {
    // Reload what the failed requests left blank, and let any page error screen retry.
    router.refresh();
    window.dispatchEvent(new Event(DESKTOP_RUNTIME_RECOVERED_EVENT));
  }, [router]);

  const { state, retry } = useRuntimeHealth(onRecovered);
  if (state.status === "ok") return null;

  const offline = state.status === "offline";
  const Icon = offline ? WifiOff : RefreshCw;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="runtime-health-banner"
      data-runtime-health={state.status}
      className="fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 rounded-surface border border-border bg-popover p-3 text-popover-foreground shadow-popover sm:inset-x-auto sm:start-4 sm:max-w-sm"
    >
      <div className="flex items-start gap-2.5">
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 space-y-1">
          <p className="text-body-sm font-medium">
            {t(offline ? "runtimeHealth.offline.title" : "runtimeHealth.reconnecting.title")}
          </p>
          <p className="text-caption text-muted-foreground">
            {t(offline ? "runtimeHealth.offline.body" : "runtimeHealth.reconnecting.body")}
          </p>
        </div>
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
