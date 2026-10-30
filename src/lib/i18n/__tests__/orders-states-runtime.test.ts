import { describe, expect, it } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import {
  ORDERS_STATES_RUNTIME_KEYS,
  getOrdersStatesRuntimeTranslation,
} from "@/lib/i18n/orders-states-runtime";

const LOCALES = ["ar", "fr", "en"] as const;
const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();

describe("orders-states runtime copy", () => {
  it("has at least the offline reasons", () => {
    expect(ORDERS_STATES_RUNTIME_KEYS).toEqual(
      expect.arrayContaining(["ordersStates.offline.writesPaused", "ordersStates.offline.syncNeedsConnection"]),
    );
  });

  it.each(ORDERS_STATES_RUNTIME_KEYS.map((key) => [key]))("%s exists in ar, fr and en, is registered, and keeps the same placeholders", (key) => {
    const en = getOrdersStatesRuntimeTranslation("en", key) ?? "";
    for (const locale of LOCALES) {
      const text = getOrdersStatesRuntimeTranslation(locale, key);
      expect(text, `${locale} ${key}`).toBeTruthy();
      expect(getRuntimeTranslation(locale, key)).toBe(text);
      expect(placeholders(text ?? "")).toEqual(placeholders(en));
    }
    expect(getOrdersStatesRuntimeTranslation("ar", key)).toMatch(/[\u0600-\u06FF]/);
    expect(getOrdersStatesRuntimeTranslation("fr", key)).not.toBe(en);
  });
});
