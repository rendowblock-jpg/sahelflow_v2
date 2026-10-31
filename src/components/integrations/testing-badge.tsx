"use client";

import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { integrationStatus, type IntegrationId, type IntegrationStatus } from "@/lib/integrations/certification";
import { cn } from "@/lib/utils";

/** What the chip means, in one sentence (screen readers and the hover tooltip). */
const MEANING = {
  en: "Not yet run against a real account; we are testing it.",
  fr: "Pas encore essayé sur un vrai compte ; nous le testons.",
  ar: "لم يُجرَّب بعد على حساب حقيقي؛ ونحن نختبره.",
} as const satisfies Record<Locale, string>;

/**
 * Marks an integration that has never run against a real account. It reads the registry, so when an integration is
 * certified the chip disappears everywhere with one edit in src/lib/integrations/certification.ts.
 */
export function TestingBadge({
  integration,
  status,
  className,
}: {
  integration: IntegrationId;
  /** Only for a caller that already knows the status; the registry is the default. */
  status?: IntegrationStatus;
  className?: string;
}) {
  const { t, locale } = useI18n();
  if ((status ?? integrationStatus(integration)) !== "testing") return null;
  const meaning = MEANING[locale === "ar" || locale === "fr" ? locale : "en"];
  return (
    <span
      role="note"
      aria-label={meaning}
      title={meaning}
      className={cn(
        "inline-flex shrink-0 items-center rounded-surface border border-dashed border-foreground/30 px-1.5 text-xs font-medium leading-5 text-muted-foreground",
        className,
      )}
    >
      {t("firstRun.integration.testing")}
    </span>
  );
}
