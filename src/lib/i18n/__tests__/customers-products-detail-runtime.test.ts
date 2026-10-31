import { describe, expect, it } from "vitest";

import {
  CUSTOMERS_PRODUCTS_DETAIL_RUNTIME_KEYS,
  getCustomersProductsDetailRuntimeTranslation,
} from "@/lib/i18n/customers-products-detail-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

describe("customers/products detail runtime copy", () => {
  it("has the three offline sentences", () => {
    expect(CUSTOMERS_PRODUCTS_DETAIL_RUNTIME_KEYS).toEqual(
      expect.arrayContaining(["cpDetail.offline.customerBanner", "cpDetail.offline.productBanner", "cpDetail.offline.listBanner"]),
    );
  });
  it.each(["ar", "fr", "en"] as const)("%s: every key has text, is registered and differs from its key", (locale) => {
    for (const key of CUSTOMERS_PRODUCTS_DETAIL_RUNTIME_KEYS) {
      const text = getCustomersProductsDetailRuntimeTranslation(locale, key);
      expect(text && text.length > 20).toBe(true);
      expect(getRuntimeTranslation(locale, key)).toBe(text);
    }
  });
});
