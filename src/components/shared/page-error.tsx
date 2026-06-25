"use client";

import { useEffect } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface PageErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}

/**
 * Premium per-page error boundary — shows a clean error state
 * with a retry button. Used by error.tsx files in route segments.
 */
export function PageError({ error, reset, title }: PageErrorProps) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("[page-error]", error);
  }, [error]);

  return (
    <div className="app-content flex min-h-[60vh] flex-col items-center justify-center gap-6">
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
      <Button onClick={reset} variant="outline" size="sm" className="animate-fade-up">
        <RefreshCw className="me-2 h-4 w-4" />
        {t("error.retry")}
      </Button>
    </div>
  );
}
