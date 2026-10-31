import { createStorefrontReleaseInput } from "./release-artifact";
import { createDefaultStorefrontTheme } from "./theme-default";

/**
 * A draft shaped like one saved BEFORE the legal pages existed: no `legal` key at all. The legal tests publish it and compare the
 * public artifact's digest with a value taken from the code as it was before this track (hosted-legal-compat.test.ts).
 */
export function oldDraftWithoutLegal() {
  const theme = createDefaultStorefrontTheme("noir");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  return {
    name: "Boutique Sahel",
    slug: "boutique-sahel",
    description: "Old draft",
    theme,
    selectedProductIds: ["product_12345678"],
    isActive: true,
  };
}

export function releaseFromDraft(draft: unknown, extra: Readonly<{ requireLegalReview?: boolean }> = {}): Record<string, unknown> {
  return createStorefrontReleaseInput({
    workspaceId: "0123456789abcdef0123456789abcdef",
    releaseId: "release_12345678",
    parentReleaseId: null,
    locale: "ar",
    draft: draft as never,
    products: [{ id: "product_12345678", name: "Product", sku: "SKU-1", images: null, price: 2_500, stock: 10, productVariants: [] }],
    ...extra,
  } as never);
}
