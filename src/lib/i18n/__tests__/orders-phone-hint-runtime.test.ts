import { describe, expect, it } from "vitest";

import { getOrdersPhoneHintRuntimeTranslation } from "../orders-phone-hint-runtime";
import { getRuntimeTranslation } from "../runtime-translations";

const KEY = "orders.searchHintPhone";
// Character budgets measured by the lead against 16 px in 262 px (31 Oct 2026). Widths are NOT measured here.
const BUDGET = { en: 26, fr: 30, ar: 24 } as const;
const TEXT = {
  en: "Search order or customer",
  fr: "Rechercher commande ou client",
  ar: "ابحث عن طلبية أو زبون",
} as const;

describe("orders search hint on a phone", () => {
  it.each(["en", "fr", "ar"] as const)("has the exact %s text within its character budget", (locale) => {
    const text = getOrdersPhoneHintRuntimeTranslation(locale, KEY);
    expect(text).toBe(TEXT[locale]);
    expect([...(text ?? "")].length).toBeLessThanOrEqual(BUDGET[locale]);
  });

  it.each(["en", "fr", "ar"] as const)("is reachable through the shared runtime lookup in %s", (locale) => {
    expect(getRuntimeTranslation(locale, KEY)).toBe(TEXT[locale]);
  });

  it("answers undefined for an unknown key", () => {
    expect(getOrdersPhoneHintRuntimeTranslation("en", "orders.searchHintPhone.nope")).toBeUndefined();
  });
});
