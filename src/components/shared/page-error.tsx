"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, RotateCw } from "lucide-react";

import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

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

  const resolvedTitle =
    title ?? (expected ? t("error.title") : t("error.unexpectedTitle"));
  const description = expected
    ? error.message || t("error.defaultMessage")
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
