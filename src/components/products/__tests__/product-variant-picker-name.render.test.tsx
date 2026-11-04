/**
 * @vitest-environment happy-dom
 */
/**
 * Found by the page sweep (4 Nov 2026, Internal.49, axe "button-name", impact critical):
 * the Variant select on products/[id] was a combobox with a visible "Variant" label that was not
 * connected to it and a placeholder as its only text, so a screen reader announced an unnamed
 * control. The select must carry the label as its accessible name in every state.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { render } from "@/test-utils/render";
import { ProductVariantPicker } from "@/components/products/product-variant-picker";

let locale: "ar" | "en" = "en";
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const table = (locale === "ar" ? ar : en) as Record<string, string>;
      return table[key] ?? getRuntimeTranslation(locale, key) ?? key;
    },
    locale,
    dir: locale === "ar" ? "rtl" : "ltr",
  }),
}));
beforeEach(() => {
  locale = "en";
});

const variants = [
  { id: "v1", name: "Red / M", sku: "R-M", price: null, stock: 4, isActive: true },
  { id: "v2", name: "Blue / L", sku: "B-L", price: 2500, stock: 0, isActive: true },
];
const words = (l: "ar" | "en") => ((l === "ar" ? ar : en) as Record<string, string>)["products.variant"]!;

describe("ProductVariantPicker accessible name", () => {
  for (const l of ["en", "ar"] as const) {
    it(`${l}: the select is named ${l === "en" ? "Variant" : "by the Arabic label"} with the label shown`, () => {
      locale = l;
      render(<ProductVariantPicker variants={variants} defaultPrice={1800} />);
      expect(screen.getByRole("combobox", { name: words(l) })).toBeTruthy();
    });
  }

  it("is still named when the visible label is hidden (showLabel false)", () => {
    render(<ProductVariantPicker variants={variants} defaultPrice={1800} showLabel={false} />);
    expect(screen.getByRole("combobox", { name: words("en") })).toBeTruthy();
  });

  it("is named in the no-variants state too", () => {
    render(<ProductVariantPicker variants={[]} defaultPrice={1800} />);
    expect(screen.getByRole("combobox", { name: words("en") })).toBeTruthy();
  });
});
