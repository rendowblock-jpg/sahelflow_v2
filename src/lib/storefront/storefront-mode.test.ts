import { describe, expect, it } from "vitest";

import { parseReleaseInput } from "../../../control-plane/storefront/release-input";
import { createStorefrontReleaseInput } from "./release-artifact";
import { STOREFRONT_PAGE_MODES, STOREFRONT_STYLE_IDS, type StorefrontTemplateId } from "./presentation-types";
import { storefrontStudioThemeSchema } from "./studio-schema";
import { normalizeStorefrontTheme, switchStorefrontTemplate } from "./theme-normalize";
import { createDefaultStorefrontTheme } from "./theme-default";

const OLD = ["sahara", "atlas", "oasis", "prime", "souk", "reel"] as const;

function release(template: StorefrontTemplateId, mode?: unknown) {
  const theme = createDefaultStorefrontTheme(template) as unknown as Record<string, unknown> & { builder: { shippingRules: unknown } };
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  if (mode === undefined) delete theme.mode;
  else theme.mode = mode;
  return createStorefrontReleaseInput({
    workspaceId: "0123456789abcdef0123456789abcdef",
    releaseId: "release_12345678",
    parentReleaseId: null,
    locale: "ar",
    draft: { name: "Shop", slug: "shop-test", description: "", theme: theme as never, selectedProductIds: ["product_12345678"], isActive: true },
    products: [{ id: "product_12345678", name: "Product", sku: "SKU-1", images: null, price: 2_500, stock: 10, productVariants: [] }],
  });
}

describe("a style is a landing page or a store (theme.mode)", () => {
  it("there are exactly two modes and five styles that have both", () => {
    expect([...STOREFRONT_PAGE_MODES]).toEqual(["landing", "store"]);
    expect([...STOREFRONT_STYLE_IDS]).toEqual(["noir", "lumen", "atelier", "pulse", "bloom"]);
  });

  it.each(STOREFRONT_STYLE_IDS)("%s starts as a landing page (a COD seller sells one product from an ad)", (id) => {
    expect(createDefaultStorefrontTheme(id).mode).toBe("landing");
  });

  it.each(OLD)("%s has no mode: its published pages must not change", (id) => {
    expect("mode" in createDefaultStorefrontTheme(id)).toBe(false);
  });

  it.each(["landing", "store"] as const)("the Studio schema and the cloud accept mode %s", (mode) => {
    const theme = { ...createDefaultStorefrontTheme("noir"), mode };
    expect(storefrontStudioThemeSchema.safeParse(theme).success).toBe(true);
    const parsed = parseReleaseInput(release("noir", mode));
    expect(parsed).not.toBeNull();
    expect((parsed?.publicArtifact.theme as unknown as { mode?: string }).mode).toBe(mode);
  });

  it.each(["grid", "", "LANDING", 1, null, true, {}, "__proto__"])("both refuse the mode %j", (mode) => {
    const theme = { ...createDefaultStorefrontTheme("noir"), mode };
    expect(storefrontStudioThemeSchema.safeParse(theme).success).toBe(false);
    const input = release("noir", "store") as unknown as { publicArtifact: { theme: { mode: unknown } } };
    input.publicArtifact.theme.mode = mode;
    expect(parseReleaseInput(input as never)).toBeNull();
  });

  it("a release published before modes existed (no mode key) is still accepted by the cloud and the Studio", () => {
    expect(parseReleaseInput(release("prime"))).not.toBeNull();
    expect(storefrontStudioThemeSchema.safeParse(createDefaultStorefrontTheme("prime")).success).toBe(true);
  });

  it("normalising keeps the mode of a saved theme", () => {
    const theme = { ...createDefaultStorefrontTheme("bloom"), mode: "store" as const };
    expect(normalizeStorefrontTheme(theme).mode).toBe("store");
  });

  it("switching to a style gives it the landing mode; between two styles the seller's choice stays; to an older template it goes away", () => {
    const old = createDefaultStorefrontTheme("atlas");
    const toStyle = switchStorefrontTemplate(old, "lumen");
    expect(toStyle.mode).toBe("landing");
    const chosen = switchStorefrontTemplate({ ...toStyle, mode: "store" }, "pulse");
    expect(chosen.mode).toBe("store");
    const back = switchStorefrontTemplate(chosen, "souk");
    expect("mode" in back).toBe(false);
  });
});
