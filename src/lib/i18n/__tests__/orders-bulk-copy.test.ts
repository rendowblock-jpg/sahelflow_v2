import { describe, expect, it } from "vitest";

import { getRuntimeTranslation } from "../runtime-translations";

/**
 * P5 slice 1 copy: every new orders-list string exists in Arabic, French and English together, carries the same
 * placeholders, and is real language (not an English line pasted into the other two). The Arabic and French wording
 * still needs a native read; this test only proves the mechanics.
 */
const KEYS = [
  "orders.workspace.bulk.cancelTitle",
  "orders.workspace.bulk.cancelBody",
  "orders.workspace.bulk.cancelConfirm",
  "orders.workspace.bulk.shipTitle",
  "orders.workspace.bulk.shipBody",
  "orders.workspace.bulk.shipConfirm",
  "orders.workspace.bulk.goBack",
  "orders.workspace.bulk.failedTitle",
  "orders.workspace.bulk.failedHint",
  "orders.workspace.bulk.reason.invalid_transition",
  "orders.workspace.bulk.reason.not_found",
  "orders.workspace.bulk.reason.other",
  "orders.workspace.bulk.more",
  "orders.workspace.bulk.unreadable",
  "orders.workspace.selectOrder",
  "orders.workspace.emptyStatus.title",
  "orders.workspace.emptyStatus.description",
  "orders.workspace.emptyStatus.action",
] as const;
const PLACEHOLDERS: Record<string, string[]> = {
  "orders.workspace.bulk.cancelBody": ["count"],
  "orders.workspace.bulk.shipBody": ["count"],
  "orders.workspace.bulk.failedTitle": ["failed", "total"],
  "orders.workspace.bulk.more": ["count"],
  "orders.workspace.selectOrder": ["number"],
};
const placeholdersOf = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe("orders list bulk and empty-state copy", () => {
  it.each(KEYS)("%s exists in ar, fr and en with the same placeholders", (key) => {
    const en = getRuntimeTranslation("en", key);
    const fr = getRuntimeTranslation("fr", key);
    const ar = getRuntimeTranslation("ar", key);
    for (const [locale, text] of [["en", en], ["fr", fr], ["ar", ar]] as const) {
      expect(text, `${key} (${locale})`).toBeTruthy();
      expect(text, `${key} (${locale}) must not be the key itself`).not.toBe(key);
      expect(placeholdersOf(text as string), `${key} (${locale}) placeholders`).toEqual((PLACEHOLDERS[key] ?? []).slice().sort());
    }
    expect(fr, `${key}: French must not be the English line`).not.toBe(en);
    expect(ar, `${key}: Arabic must hold Arabic letters`).toMatch(/[\u0600-\u06FF]/);
  });

  it("never promises more than the lifecycle allows", () => {
    // A shipped order cannot be cancelled and a cancelled one cannot be reopened (order-transitions.ts).
    expect(getRuntimeTranslation("en", "orders.workspace.bulk.shipBody")).toMatch(/no longer be cancelled/);
    expect(getRuntimeTranslation("en", "orders.workspace.bulk.cancelBody")).toMatch(/cannot be reopened/);
    expect(getRuntimeTranslation("en", "orders.workspace.bulk.goBack")).not.toMatch(/cancel/i);
  });
});
