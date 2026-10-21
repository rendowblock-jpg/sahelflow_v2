import { describe, expect, it } from "vitest";

import { parseReleaseInput } from "../../../control-plane/storefront/release-input";
import { createStorefrontReleaseInput } from "./release-artifact";
import { storefrontStudioDraftSchema } from "./studio-schema";
import { createDefaultStorefrontTheme } from "./theme-default";
import type { StorefrontTemplateId } from "./presentation-types";

/**
 * What the Studio can author must be what the cloud accepts. The Studio's schema takes any block type of two or more characters
 * ("faq", "testimonial"); the cloud once demanded eight or more, so a seller who added a FAQ item or a review could save and preview,
 * and then the publish was refused with invalid_release. These tests build a draft exactly like the Studio does and push it through both.
 */
function draftWith(template: StorefrontTemplateId, sections: unknown[]) {
  const theme = createDefaultStorefrontTheme(template);
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  const all = theme.builder.composition.sections as unknown as unknown[];
  all.splice(all.length - 2, 0, ...sections);
  return { name: "Shop", slug: "shop-test", description: "", theme, selectedProductIds: ["product_12345678"], isActive: true };
}

const faq = {
  id: "faq-0a1b2c3d4e5f",
  type: "faq",
  enabled: true,
  settings: { title: "Questions" },
  blocks: [{ id: "faq-1a2b3c4d5e6f", type: "faq", settings: { question: "Can I pay on delivery?", answer: "Yes." } }],
};
const testimonials = {
  id: "testimonials-0a1b2c3d4e5f",
  type: "testimonials",
  enabled: true,
  settings: { title: "Reviews" },
  blocks: [{ id: "testimonial-1a2b3c4d5e6f", type: "testimonial", settings: { quote: "Fast delivery", name: "Amine", role: "Oran" } }],
};

function release(draft: ReturnType<typeof draftWith>) {
  return createStorefrontReleaseInput({
    workspaceId: "0123456789abcdef0123456789abcdef",
    releaseId: "release_12345678",
    parentReleaseId: null,
    locale: "ar",
    draft: draft as never,
    products: [{ id: "product_12345678", name: "Product", sku: "SKU-1", images: null, price: 2_500, stock: 10, productVariants: [] }],
  });
}

describe("a draft the Studio accepts is a release the cloud accepts", () => {
  it.each(["sahara", "noir", "bloom"] as const)("%s: FAQ items and reviews survive publish", (template) => {
    const draft = draftWith(template, [faq, testimonials]);
    expect(storefrontStudioDraftSchema.safeParse(draft).success).toBe(true);
    const parsed = parseReleaseInput(release(draft));
    expect(parsed).not.toBeNull();
    const theme = parsed?.publicArtifact.theme as unknown as { builder: { composition: { sections: Array<{ type: string }> } } } | undefined;
    const types = theme?.builder.composition.sections.map((section) => section.type) ?? [];
    expect(types).toContain("faq");
    expect(types).toContain("testimonials");
  });

  it("a block type with characters outside the allowed set is still refused by the cloud, even when someone skips the Studio", () => {
    for (const type of ["f aq", "faq<", "", "x".repeat(200), "_faq"]) {
      const input = release(draftWith("noir", [faq])) as unknown as { publicArtifact: { theme: { builder: { composition: { sections: Array<{ type: string; blocks: Array<{ type: string }> }> } } } } };
      const section = input.publicArtifact.theme.builder.composition.sections.find((entry) => entry.type === "faq");
      if (!section?.blocks[0]) throw new Error("no faq block in the test release");
      section.blocks[0].type = type;
      expect(parseReleaseInput(input as never), JSON.stringify(type)).toBeNull();
    }
  });
});
