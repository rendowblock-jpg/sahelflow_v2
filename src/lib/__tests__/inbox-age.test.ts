import { describe, expect, it } from "vitest";

import { formatInboxAge } from "@/lib/inbox-age";
import { intlLocale } from "@/lib/utils";

const at = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

const LOCALES = ["ar", "fr", "en"] as const;
const rtf = (locale: (typeof LOCALES)[number]) =>
  new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });

describe("formatInboxAge", () => {
  const now = at(2026, 10, 20, 2, 24);

  it.each(LOCALES)("says 'now' for a few seconds (%s)", (locale) => {
    expect(formatInboxAge(now - 20_000, now, locale)).toBe(rtf(locale).format(0, "second"));
  });

  it.each(LOCALES)("counts minutes and hours inside a day (%s)", (locale) => {
    expect(formatInboxAge(now - 5 * 60_000, now, locale)).toBe(rtf(locale).format(-5, "minute"));
    expect(formatInboxAge(now - 3 * 3_600_000, now, locale)).toBe(rtf(locale).format(-3, "hour"));
  });

  it.each(LOCALES)(
    "does not call a message from two calendar days ago 'yesterday' (%s)",
    (locale) => {
      // The Founder's inbox: Sunday 19:39, seen on Tuesday 02:24 (31 hours).
      const label = formatInboxAge(at(2026, 10, 18, 19, 39), now, locale);
      expect(label).toBe(rtf(locale).format(-2, "day"));
      expect(label).not.toBe(rtf(locale).format(-1, "day"));
    },
  );

  it.each(LOCALES)("calls the previous calendar day 'yesterday' (%s)", (locale) => {
    const evening = at(2026, 10, 20, 20, 0);
    expect(formatInboxAge(at(2026, 10, 19, 9, 0), evening, locale)).toBe(
      rtf(locale).format(-1, "day"),
    );
  });

  it.each(LOCALES)("uses weekday-sized day counts up to six days (%s)", (locale) => {
    expect(formatInboxAge(at(2026, 10, 14, 12), at(2026, 10, 20, 12), locale)).toBe(
      rtf(locale).format(-6, "day"),
    );
  });

  it.each(LOCALES)("switches to a short date from seven days on (%s)", (locale) => {
    const value = at(2026, 10, 13, 12);
    expect(formatInboxAge(value, at(2026, 10, 20, 12), locale)).toBe(
      new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" }).format(
        new Date(value),
      ),
    );
  });

  it("treats a timestamp slightly in the future (clock skew) as 'now'", () => {
    expect(formatInboxAge(now + 5_000, now, "en")).toBe(rtf("en").format(0, "second"));
  });
});
