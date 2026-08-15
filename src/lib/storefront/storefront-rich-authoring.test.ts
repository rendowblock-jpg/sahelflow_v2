import { describe, expect, it } from "vitest";

import { createDefaultStorefrontTheme } from "./theme-default";
import {
  addStorefrontBlock,
  addStorefrontSection,
  patchStorefrontBlockSettings,
  patchStorefrontSectionSettings,
  reorderStorefrontSection,
  type StorefrontStudioDraft,
} from "./studio-draft";
import { storefrontStudioDraftSchema } from "./studio-schema";

function draft(): StorefrontStudioDraft {
  return {
    name: "Rich authoring",
    slug: "rich-authoring",
    description: "Internal.19 storefront authoring test",
    theme: createDefaultStorefrontTheme("atlas"),
    selectedProductIds: ["product:1"],
    isActive: true,
  };
}

describe("Storefront rich authoring", () => {
  it("reorders a section directly to an exact index without mutating the source draft", () => {
    const original = draft();
    const footer = original.theme.builder.composition.sections.find(
      (section) => section.type === "footer",
    );
    expect(footer).toBeDefined();
    if (!footer) return;

    const moved = reorderStorefrontSection(original, footer.id, 1);
    expect(moved.theme.builder.composition.sections[1]?.id).toBe(footer.id);
    expect(
      original.theme.builder.composition.sections.findIndex(
        (section) => section.id === footer.id,
      ),
    ).not.toBe(1);
  });

  it("requires authored media URLs to be blank or HTTPS", () => {
    let value = addStorefrontSection(draft(), "media:test", "media");
    value = patchStorefrontSectionSettings(value, "media:test", {
      title: "A real media section",
      imageUrl: "http://example.com/image.jpg",
    });
    expect(storefrontStudioDraftSchema.safeParse(value).success).toBe(false);

    value = patchStorefrontSectionSettings(value, "media:test", {
      imageUrl: "https://example.com/image.jpg",
      imageAlt: "Product package",
      align: "split",
    });
    expect(storefrontStudioDraftSchema.safeParse(value).success).toBe(true);
  });

  it("accepts typed testimonial blocks and rejects unrelated block types", () => {
    let value = addStorefrontSection(
      draft(),
      "testimonials:test",
      "testimonials",
    );
    value = addStorefrontBlock(value, "testimonials:test", {
      id: "testimonial:1",
      type: "testimonial",
      settings: {
        quote: "Excellent COD experience",
        name: "Amine",
        role: "Customer",
      },
    });
    expect(storefrontStudioDraftSchema.safeParse(value).success).toBe(true);

    value = addStorefrontBlock(value, "testimonials:test", {
      id: "faq:wrong",
      type: "faq",
      settings: { question: "Wrong block" },
    });
    expect(storefrontStudioDraftSchema.safeParse(value).success).toBe(false);
  });

  it("persists bounded FAQ block edits through the same draft schema", () => {
    let value = addStorefrontSection(draft(), "faq:test", "faq");
    value = addStorefrontBlock(value, "faq:test", {
      id: "faq:1",
      type: "faq",
      settings: { question: "Can I pay on delivery?", answer: "Yes." },
    });
    value = patchStorefrontBlockSettings(value, "faq:test", "faq:1", {
      answer: "Yes. Cash on delivery is available for this storefront.",
    });
    expect(storefrontStudioDraftSchema.safeParse(value).success).toBe(true);
  });
});
