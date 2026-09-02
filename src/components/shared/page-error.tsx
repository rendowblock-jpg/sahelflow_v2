"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, RotateCw } from "lucide-react";

import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import { DESKTOP_RUNTIME_RECOVERED_EVENT } from "@/lib/runtime/desktop-recovery";

interface PageErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  hideReload?: boolean;
}

function isExpectedError(error: Error & { digest?: string }): boolean {
  const message = (error.message || "").toLowerCase();
  return (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("not found") ||
    message.includes("rate limit") ||
    message.includes("invalid") ||
    message.includes("validation") ||
    !!error.digest?.toUpperCase().startsWith("NEXT_")
  );
}

/**
 * Persistent page failure/recovery state.
 *
 * Unexpected runtime details are intentionally not reflected into the UI. They
 * remain in diagnostics while the seller receives preservation-safe recovery
 * actions and human copy. Expected validation/authorization-style failures may
 * retain their bounded message when useful.
 */
export function PageError({ error, reset, title, hideReload }: PageErrorProps) {
  const { t } = useI18n();
  const expected = isExpectedError(error);

  useEffect(() => {
    if (expected) {
      console.warn("[page-error] expected error:", error);
    } else {
      console.error("[page-error] unexpected error:", error);
    }
  }, [error, expected]);

  // A page that failed only because Windows suspended the bundled local runtime
  // should heal as soon as the desktop resume controller has re-established app
  // + database health. Genuine errors remain visible because this event is only
  // emitted after an actual long resume gap and a successful local health probe.
  useEffect(() => {
    const retryAfterDesktopResume = () => reset();
    window.addEventListener(
      DESKTOP_RUNTIME_RECOVERED_EVENT,
      retryAfterDesktopResume,
    );
    return () =>
      window.removeEventListener(
        DESKTOP_RUNTIME_RECOVERED_EVENT,
        retryAfterDesktopResume,
      );
  }, [reset]);

  const resolvedTitle =
    title ?? (expected ? t("error.title") : t("error.unexpectedTitle"));
  // Expected errors may carry a bounded, human-readable message — translate the
  // known server strings; raw text remains in the diagnostics channel above.
  const description = expected
    ? translateServerError(error.message, t, t("error.defaultMessage"))
    : t("error.unexpectedMessage");

  return (
    <div className="app-content">
      <StateSurface
        icon={AlertTriangle}
        title={resolvedTitle}
        description={description}
        tone="danger"
        size="page"
        role="alert"
        live="polite"
        testId="page-error"
        actions={
          <>
            <Button
              type="button"
              onClick={reset}
              variant="outline"
              size="sm"
              data-testid="page-error-retry"
            >
              <RefreshCw className="me-2 size-4" aria-hidden="true" />
              {t("error.retry")}
            </Button>
            {!hideReload ? (
              <Button
                type="button"
                onClick={() => window.location.reload()}
                variant="ghost"
                size="sm"
                data-testid="page-error-reload"
              >
                <RotateCw className="me-2 size-4" aria-hidden="true" />
                {t("error.reload")}
              </Button>
            ) : null}
          </>
        }
      />
    </div>
  );
}
