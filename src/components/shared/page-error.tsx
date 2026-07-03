"use client";

import { useEffect } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, RotateCw } from "lucide-react";

interface PageErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  /** Hide the "Reload page" button (e.g. for routes where reload makes no sense). */
  hideReload?: boolean;
}

/**
 * Expected-error heuristic — these should NOT be reported to Sentry
 * (they'd pollute the error stream with non-actionable 4xx-style noise).
 * Only genuine crashes get reported (in global-error.tsx + via the
 * useEffect console.error for dev visibility).
 */
function isExpectedError(error: Error & { digest?: string }): boolean {
  const msg = (error.message || "").toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("not found") ||
    msg.includes("rate limit") ||
    msg.includes("invalid") ||
    msg.includes("validation") ||
    !!error.digest?.toUpperCase().startsWith("NEXT_")
  );
}

/**
 * Premium per-page error boundary — shows a clean error state with retry +
 * reload. Used by all error.tsx files in route segments.
 *
 * Phase 0 enhancements:
 *   - "Reload page" button alongside "Try again" (reload is often what users
 *     actually need — retry re-renders the same segment, reload hits the server).
 *   - Expected-error gating: only console.error (and Sentry, via global-error)
 *     on unexpected errors. 4xx-style errors are swallowed from error reporting.
 *   - data-testid for reliable E2E targeting.
 */
export function PageError({ error, reset, title, hideReload }: PageErrorProps) {
  const { t } = useI18n();
  const expected = isExpectedError(error);

  useEffect(() => {
    // Always log to console for dev visibility.
    if (expected) {
      console.warn("[page-error] expected error:", error);
    } else {
      console.error("[page-error] unexpected error:", error);
    }
  }, [error, expected]);

  return (
    <div
      className="app-content flex min-h-[60vh] flex-col items-center justify-center gap-6"
      data-testid="page-error"
    >
      <div className="animate-fade-up text-center space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-destructive/5">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold">{title ?? t("error.title")}</h2>
          <p className="text-sm text-muted-foreground text-balance max-w-sm">
            {error.message || t("error.defaultMessage")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 animate-fade-up">
        <Button onClick={reset} variant="outline" size="sm" data-testid="page-error-retry">
          <RefreshCw className="me-2 h-4 w-4" />
          {t("error.retry")}
        </Button>
        {!hideReload && (
          <Button
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            variant="ghost"
            size="sm"
            data-testid="page-error-reload"
          >
            <RotateCw className="me-2 h-4 w-4" />
            {t("error.reload")}
          </Button>
        )}
      </div>
    </div>
  );
}
