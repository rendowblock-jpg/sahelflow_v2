import type { Locale } from "@/lib/i18n";
import { getInboxHealthRuntimeTranslation } from "@/lib/i18n/inbox-health-runtime";

/**
 * How long the oldest waiting WhatsApp message has waited, as a seller reads it
 * at a glance: "59 min", "2 h", "2 days" (never "3209 minutes"). Whole numbers,
 * rounded down, like the rest of the inbox health copy.
 *
 *   under 120 min -> minutes
 *   under 48 h    -> hours
 *   otherwise     -> days
 *
 * The noun follows the language's own plural rule (Intl.PluralRules, as
 * silent-note-text.ts does): Arabic needs دقيقتين / ساعات / يوماً. Plain
 * counting only; nothing here says "delivered".
 */
export const WAIT_AGE_HOURS_FROM_MINUTES = 120;
export const WAIT_AGE_DAYS_FROM_HOURS = 48;

export type WaitAgeUnit = "min" | "h" | "day";

export interface WaitAge {
  unit: WaitAgeUnit;
  value: number;
}

/** Pure: minutes in, the unit and the whole number to show out. */
export function waitAge(minutes: number): WaitAge {
  const whole = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  if (whole < WAIT_AGE_HOURS_FROM_MINUTES) return { unit: "min", value: whole };
  const hours = Math.floor(whole / 60);
  if (hours < WAIT_AGE_DAYS_FROM_HOURS) return { unit: "h", value: hours };
  return { unit: "day", value: Math.floor(hours / 24) };
}

export function formatWaitAge(locale: Locale, minutes: number): string {
  const { unit, value } = waitAge(minutes);
  const key = `inboxHealth.age.${unit}`;
  const rule = new Intl.PluralRules(locale).select(value);
  const template =
    getInboxHealthRuntimeTranslation(locale, `${key}_${rule}`) ??
    getInboxHealthRuntimeTranslation(locale, key) ??
    "";
  return template.replace(/\{\{n\}\}/g, String(value));
}
