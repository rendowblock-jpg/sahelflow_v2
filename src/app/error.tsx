"use client";

import { useEffect } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="animate-fade-up text-center space-y-4">
        {/* Premium error icon */}
        <div className="mx-auto rounded-2xl bg-gradient-to-br from-destructive/15 to-destructive/5 p-5 ring-1 ring-destructive/20 w-fit">
          <AlertTriangle className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">{t("error.title")}</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          {error.message || t("error.defaultMessage")}
        </p>
      </div>
      <Button onClick={reset} className="animate-fade-up" style={{ animationDelay: "100ms" }}>
        {t("error.retry")}
      </Button>
    </div>
  );
}
