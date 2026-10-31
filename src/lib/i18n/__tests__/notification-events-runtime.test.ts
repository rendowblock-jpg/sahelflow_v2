import { describe, expect, it } from "vitest";
import type { Locale } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { NOTIFICATION_EVENTS_CATALOG } from "@/lib/i18n/notification-events-runtime";
import { KIND_SPECS, NOTIFICATION_KINDS } from "@/lib/notifications/event-kinds";

const LOCALES: Locale[] = ["ar", "fr", "en"];

describe("notification event wording", () => {
  it("every kind has a title and a sentence in ar, fr and en, reachable through the shared runtime lookup", () => {
    for (const locale of LOCALES) {
      for (const kind of NOTIFICATION_KINDS) {
        const spec = KIND_SPECS[kind];
        expect(getRuntimeTranslation(locale, spec.titleKey), `${locale} ${spec.titleKey}`).toBeTruthy();
        expect(getRuntimeTranslation(locale, spec.bodyKey), `${locale} ${spec.bodyKey}`).toBeTruthy();
      }
    }
  });
  it("counted kinds have a form for every number the language can ask for", () => {
    for (const locale of LOCALES) {
      const rules = new Intl.PluralRules(locale);
      for (const kind of NOTIFICATION_KINDS.filter((k) => KIND_SPECS[k].counted)) {
        for (const n of [0, 1, 2, 3, 5, 10, 11, 12, 40, 99, 100, 101, 102, 1000]) {
          const key = `${KIND_SPECS[kind].bodyKey}_${rules.select(n)}`;
          const text = NOTIFICATION_EVENTS_CATALOG[locale][key];
          expect(text, `${locale} ${key} for ${n}`).toBeTruthy();
          if (rules.select(n) === "other" || rules.select(n) === "many" || rules.select(n) === "few") {
            expect(text).toContain("{{count}}");
          }
        }
      }
    }
  });
  it("the phone alerts note says the truth: only while SahelFlow is open on the PC", () => {
    expect(getRuntimeTranslation("en", "notifications.phoneAlerts.note")).toBe("Alerts only come while SahelFlow is open on your PC.");
  });
});
