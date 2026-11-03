// F-0027. How long the oldest waiting WhatsApp message has waited, in words a
// seller reads at a glance: "3209 minutes" becomes "2 days". Pure function, no
// stand-ins. Rule (brief C): under 120 min -> minutes; under 48 h -> whole
// hours; otherwise whole days (all rounded down, like the rest of the inbox
// health copy). Arabic nouns follow Intl.PluralRules and always follow
// "منذ" (since), so the dual is the oblique form: دقيقتين / ساعتين / يومين.
import { describe, expect, it } from "vitest";

import {
  WAIT_AGE_DAYS_FROM_HOURS,
  WAIT_AGE_HOURS_FROM_MINUTES,
  formatWaitAge,
  waitAge,
} from "@/lib/inbox/wait-age";

const LOCALES = ["en", "fr", "ar"] as const;

const TABLE = [
  // The four values of the brief.
  { minutes: 59, en: "59 min", fr: "59 min", ar: "59 دقيقة" },
  { minutes: 125, en: "2 h", fr: "2 h", ar: "ساعتين" },
  // The Founder's screenshot: 3209 min is 53.5 h, which is over 48 h, so days.
  { minutes: 3209, en: "2 days", fr: "2 jours", ar: "يومين" },
  { minutes: 20_000, en: "13 days", fr: "13 jours", ar: "13 يوماً" },
  // Edges of every rule.
  { minutes: 1, en: "1 min", fr: "1 min", ar: "دقيقة واحدة" },
  { minutes: 2, en: "2 min", fr: "2 min", ar: "دقيقتين" },
  { minutes: 5, en: "5 min", fr: "5 min", ar: "5 دقائق" },
  { minutes: 119, en: "119 min", fr: "119 min", ar: "119 دقيقة" },
  { minutes: 120, en: "2 h", fr: "2 h", ar: "ساعتين" },
  { minutes: 180, en: "3 h", fr: "3 h", ar: "3 ساعات" },
  { minutes: 660, en: "11 h", fr: "11 h", ar: "11 ساعة" },
  { minutes: 2879, en: "47 h", fr: "47 h", ar: "47 ساعة" },
  { minutes: 2880, en: "2 days", fr: "2 jours", ar: "يومين" },
  { minutes: 4320, en: "3 days", fr: "3 jours", ar: "3 أيام" },
] as const;

describe("formatWaitAge: one readable age in en, fr and ar", () => {
  for (const row of TABLE) {
    for (const locale of LOCALES) {
      it(`${row.minutes} min in ${locale} reads "${row[locale]}"`, () => {
        expect(formatWaitAge(locale, row.minutes)).toBe(row[locale]);
      });
    }
  }

  it("never prints the raw minute count of a long wait, and never the word minutes", () => {
    for (const locale of LOCALES) {
      const text = formatWaitAge(locale, 3209);
      expect(text).not.toContain("3209");
      expect(text).not.toMatch(/minutes|دقيقة|دقائق/);
    }
  });

  it("rounds down and tolerates odd input", () => {
    expect(formatWaitAge("en", 59.9)).toBe("59 min");
    expect(formatWaitAge("en", 0)).toBe("0 min");
    expect(formatWaitAge("en", -5)).toBe("0 min");
    expect(formatWaitAge("en", Number.NaN)).toBe("0 min");
  });
});

describe("waitAge: the unit rule", () => {
  it("switches at 120 min and at 48 h, and the thresholds are the exported constants", () => {
    expect(WAIT_AGE_HOURS_FROM_MINUTES).toBe(120);
    expect(WAIT_AGE_DAYS_FROM_HOURS).toBe(48);
    expect(waitAge(119)).toEqual({ unit: "min", value: 119 });
    expect(waitAge(120)).toEqual({ unit: "h", value: 2 });
    expect(waitAge(48 * 60 - 1)).toEqual({ unit: "h", value: 47 });
    expect(waitAge(48 * 60)).toEqual({ unit: "day", value: 2 });
  });
});
