import type { Locale } from "@/lib/i18n";
import { getAutomationRuntimeTranslation } from "@/lib/i18n/automation-runtime";
import { getCommerceRuntimeTranslation } from "@/lib/i18n/commerce-runtime";
import { getPhase5RuntimeTranslation } from "@/lib/i18n/phase5-runtime";
import { getWhatsAppRecoveryTranslation } from "@/lib/i18n/whatsapp-recovery";

const SHARED_RUNTIME_COPY = {
  en: {
    "common.timeline": "Timeline",
  },
  fr: {
    "common.timeline": "Chronologie",
  },
  ar: {
    "common.timeline": "الخط الزمني",
  },
} as const satisfies Record<Locale, Record<string, string>>;

/**
 * Shared fallback translation authority for copy that is generated or owned by
 * runtime subsystems rather than the static locale JSON bundle.
 *
 * Both server and client translators must call this resolver so a key cannot be
 * translated in a hydrated client while leaking its dotted identifier from a
 * Server Component render.
 */
export function getRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return (
    (SHARED_RUNTIME_COPY[locale] as Readonly<Record<string, string>>)[key] ??
    getAutomationRuntimeTranslation(locale, key) ??
    getCommerceRuntimeTranslation(locale, key) ??
    getPhase5RuntimeTranslation(locale, key) ??
    getWhatsAppRecoveryTranslation(locale, key)
  );
}
