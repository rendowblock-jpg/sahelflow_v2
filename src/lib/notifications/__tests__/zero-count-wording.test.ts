import { describe, expect, it } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { bodyKeyForCount } from "@/lib/notifications/event-kinds";

import { ZERO_MEANS_NOTHING } from "./seller-read";

const LOCALES = ["ar", "fr", "en"] as const;
const KEY = (kind: string, form = "body") => `notifications.events.${kind}.${form}`;

describe("a row whose live number fell to 0 says that nothing is waiting", () => {
  for (const locale of LOCALES) {
    for (const kind of ZERO_MEANS_NOTHING) {
      it(`${locale} ${kind}: a zero sentence with no number, not the 'something waits' sentence and not the 'one' sentence`, () => {
        const zero = getRuntimeTranslation(locale, KEY(kind, "body_zero"));
        expect(zero, `${KEY(kind, "body_zero")} in ${locale}`).toBeTruthy();
        expect(zero).not.toMatch(/\{\{|[0-9\u0660-\u0669]/);
        expect(zero).not.toBe(getRuntimeTranslation(locale, KEY(kind)));
        expect(zero).not.toBe(getRuntimeTranslation(locale, KEY(kind, "body_one")));
        expect(zero).not.toBe(getRuntimeTranslation(locale, KEY(kind, "body_other")));
      });
    }
  }

  it("the key for a count: _zero at 0 for the five kinds, the plain key for every other case", () => {
    const toConfirm = KEY("orders.toConfirm");
    expect(bodyKeyForCount("orders.toConfirm", toConfirm, 0)).toBe(KEY("orders.toConfirm", "body_zero"));
    expect(bodyKeyForCount("whatsapp.held", KEY("whatsapp.held"), 0)).toBe(KEY("whatsapp.held", "body_zero"));
    expect(bodyKeyForCount("orders.toConfirm", toConfirm, 3)).toBe(toConfirm);
    expect(bodyKeyForCount("orders.toConfirm", toConfirm, 1)).toBe(toConfirm);
    expect(bodyKeyForCount("orders.toConfirm", toConfirm, null)).toBe(toConfirm);
    // licence.ending carries a number of days; 0 days is "ends today", not "nothing is waiting".
    expect(bodyKeyForCount("licence.ending", KEY("licence.ending"), 0)).toBe(KEY("licence.ending"));
    expect(bodyKeyForCount(null, "notifications.inbox.body", 0)).toBe("notifications.inbox.body");
  });
});
