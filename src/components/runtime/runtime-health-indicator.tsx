"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/hooks/use-i18n";
import type { RuntimeHealthState } from "@/lib/runtime/runtime-health";

import { useRuntimeHealthStatus } from "./runtime-health-provider";

/**
 * The status of the app's local service, as a small amber control in the top
 * bar's inline-end cluster. It is part of the bar's row, so it cannot cover page
 * actions, the sidebar or the Inbox composer, and the bar's height does not
 * change. It stays for as long as the problem lasts, goes when the runtime holds
 * steady, and never opens by itself: a click opens a short note with Retry and
 * Close, the same popover pattern as the update chip beside it.
 *
 * Below md it is the icon only (the text is the accessible name); from md it
 * also shows the short title.
 */
export function RuntimeHealthIndicator() {
  const health = useRuntimeHealthStatus();
  if (!health || health.state.status === "ok") return null;
  // A separate component: when the problem ends it unmounts, so an open note is
  // never remembered into the next outage.
  return <RuntimeHealthControl state={health.state} retry={health.retry} />;
}

function RuntimeHealthControl({ state, retry }: { state: RuntimeHealthState; retry: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const offline = state.status === "offline";
  const Icon = offline ? WifiOff : RefreshCw;
  const title = t(offline ? "runtimeHealth.offline.title" : "runtimeHealth.reconnecting.title");
  const body = t(offline ? "runtimeHealth.offline.body" : "runtimeHealth.reconnecting.body");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="runtime-health-indicator"
          data-runtime-health={state.status}
          aria-label={title}
          className="h-8 w-8 shrink-0 gap-1.5 whitespace-nowrap border border-warning/25 bg-warning-soft px-0 text-warning-ink hover:bg-warning-strong md:w-auto md:px-2"
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span className="hidden max-w-56 truncate text-caption font-medium md:inline">{title}</span>
        </Button>
      </PopoverTrigger>

      <span className="sr-only" role="status" aria-live="polite">
        {title}
      </span>

      <PopoverContent
        align="end"
        data-testid="runtime-health-banner"
        data-runtime-health={state.status}
        className="w-80 space-y-3 p-3"
      >
        <div className="flex items-start gap-2.5">
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-body-sm font-medium">{title}</p>
            <p className="text-caption text-muted-foreground">{body}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={state.retrying}
            onClick={retry}
            data-testid="runtime-health-retry"
          >
            {t(state.retrying ? "runtimeHealth.retrying" : "runtimeHealth.retry")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            data-testid="runtime-health-dismiss"
          >
            {t("runtimeHealth.close")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
