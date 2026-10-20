import { describe, expect, it } from "vitest";

import { parseReleaseInput } from "../../../control-plane/storefront/release-input";
import { createStorefrontReleaseInput } from "./release-artifact";
import { STOREFRONT_TEMPLATE_IDS, type StorefrontTemplateId } from "./presentation-types";
import { storefrontStudioThemeSchema } from "./studio-schema";
import { contrastRatio, storefrontScheme, storefrontThemeStyle } from "./storefront-tokens";
import { normalizeStorefrontTheme } from "./theme-normalize";
import { STOREFRONT_TEMPLATE_PRESETS } from "./template-presets";
import { createDefaultStorefrontTheme } from "./theme-default";

const NEW_IDS = ["prime", "souk", "reel"] as const satisfies readonly StorefrontTemplateId[];

function releaseFor(template: StorefrontTemplateId) {
  const theme = createDefaultStorefrontTheme(template);
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  return createStorefrontReleaseInput({
    workspaceId: "0123456789abcdef0123456789abcdef",
    releaseId: "release_12345678",
    parentReleaseId: null,
    locale: "ar",
    draft: { name: "Shop", slug: "shop-test", description: "", theme, selectedProductIds: ["product_12345678"], isActive: true },
    products: [{ id: "product_12345678", name: "Product", sku: "SKU-1", images: null, price: 2_500, stock: 10, productVariants: [] }],
  });
}

describe("storefront template registry (ids)", () => {
  it("keeps the three published ids and adds prime, souk and reel", () => {
    expect([...STOREFRONT_TEMPLATE_IDS]).toEqual(["sahara", "atlas", "oasis", "prime", "souk", "reel"]);
  });

  it.each(STOREFRONT_TEMPLATE_IDS)("%s has a palette, a default theme the Studio schema accepts, and survives normalisation", (id) => {
    expect(STOREFRONT_TEMPLATE_PRESETS[id]).toBeDefined();
    const theme = createDefaultStorefrontTheme(id);
    expect(theme.template).toBe(id);
    expect(storefrontStudioThemeSchema.safeParse(theme).success).toBe(true);
    expect(normalizeStorefrontTheme(theme).template).toBe(id);
  });

  it.each(NEW_IDS)("the cloud accepts a release whose theme is %s and keeps the id", (id) => {
    const parsed = parseReleaseInput(releaseFor(id));
    expect(parsed).not.toBeNull();
    expect(parsed?.templateId).toBe(id);
    expect(parsed?.publicArtifact.theme.template).toBe(id);
  });

  it("still rejects an id that is not registered", () => {
    const input = releaseFor("prime") as unknown as { templateId: string; publicArtifact: { theme: { template: string } } };
    input.templateId = "vitrine";
    input.publicArtifact.theme.template = "vitrine";
    expect(parseReleaseInput(input as never)).toBeNull();
  });

  it("a release whose templateId and theme.template disagree is refused", () => {
    const input = releaseFor("souk") as unknown as { templateId: string };
    input.templateId = "reel";
    expect(parseReleaseInput(input as never)).toBeNull();
  });
});

describe("default palettes of the new templates read well", () => {
  it.each(NEW_IDS)("%s: body text AAA on the page, secondary text AA on page and surface, button text AA, ink on the surface AAA", (id) => {
    const theme = createDefaultStorefrontTheme(id);
    const style = storefrontThemeStyle(theme) as Record<string, string>;
    expect(contrastRatio(theme.textColor, theme.backgroundColor)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(style["--muted-foreground"] as string, theme.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--muted-foreground"] as string, theme.surfaceColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--primary-foreground"] as string, theme.primaryColor)).toBeGreaterThanOrEqual(4.5);
    // The ink to print on the surface is derived from the surface, never assumed to be the page text.
    expect(style["--sf-on-surface"]).toBeDefined();
    expect(contrastRatio(style["--sf-on-surface"] as string, theme.surfaceColor)).toBeGreaterThanOrEqual(7);
  });

  it("prime and reel are dark pages, souk is a light page", () => {
    expect(storefrontScheme(createDefaultStorefrontTheme("prime"))).toBe("dark");
    expect(storefrontScheme(createDefaultStorefrontTheme("reel"))).toBe("dark");
    expect(storefrontScheme(createDefaultStorefrontTheme("souk"))).toBe("light");
  });
});
