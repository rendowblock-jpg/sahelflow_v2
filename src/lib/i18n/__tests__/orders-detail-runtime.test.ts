import { describe, expect, it } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { ORDERS_DETAIL_RUNTIME_KEYS, getOrdersDetailRuntimeTranslation } from "@/lib/i18n/orders-detail-runtime";

const LOCALES = ["ar", "fr", "en"] as const;

describe("orders-detail runtime copy", () => {
  it("has the offline reason and the banner sentence", () => {
    expect(ORDERS_DETAIL_RUNTIME_KEYS).toEqual(
      expect.arrayContaining(["ordersDetail.offline.reason", "ordersDetail.offline.banner"]),
    );
  });
  it.each(ORDERS_DETAIL_RUNTIME_KEYS.map((key) => [key]))("%s exists in ar, fr, en and is registered", (key) => {
    const en = getOrdersDetailRuntimeTranslation("en", key) ?? "";
    for (const locale of LOCALES) {
      const text = getOrdersDetailRuntimeTranslation(locale, key);
      expect(text, `${locale} ${key}`).toBeTruthy();
      expect(getRuntimeTranslation(locale, key)).toBe(text);
    }
    expect(getOrdersDetailRuntimeTranslation("ar", key)).toMatch(/[\u0600-\u06FF]/);
    expect(getOrdersDetailRuntimeTranslation("fr", key)).not.toBe(en);
  });
});
