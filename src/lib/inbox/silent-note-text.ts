import type { Locale } from "@/lib/i18n";
import { getInboxHealthViewRuntimeTranslation } from "@/lib/i18n/inbox-health-view-runtime";

/**
 * The text of the grey "last customer message" note. `hours` is the whole
 * number of hours since that message (the note only exists from 6 h up).
 * From 48 h it counts days. The noun form follows the language's own plural
 * rule (Intl.PluralRules, the same rule use-i18n.ts applies): Arabic needs
 * ساعات / أيام for 3 to 10, ساعة / يوماً for 11 and up, and يومين for 2 days.
 * A language with no `_rule` key for a count uses the plain key (en, fr).
 */
export function silentNoteText(locale: Locale, hours: number): string {
  const days = hours >= 48 ? Math.floor(hours / 24) : 0;
  const key = days > 0 ? "inboxHealth.silent.days" : "inboxHealth.silent.hours";
  const rule = new Intl.PluralRules(locale).select(days > 0 ? days : hours);
  const template =
    getInboxHealthViewRuntimeTranslation(locale, `${key}_${rule}`) ??
    getInboxHealthViewRuntimeTranslation(locale, key) ??
    "";
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(name === "days" ? days : hours));
}
