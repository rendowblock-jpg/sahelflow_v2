import { describe, expect, it } from "vitest";
import { createDefaultStorefrontTheme } from "./theme-default";
import { normalizeStorefrontTheme, switchStorefrontTemplate } from "./theme-normalize";
import { storefrontStudioDraftSchema, storefrontStudioThemeSchema } from "./studio-schema";
import { projectPublicStorefrontConfig } from "./public-projection";
import {
  addStorefrontSection,
  deleteStorefrontSection,
  duplicateStorefrontSection,
  moveStorefrontSection,
  toggleStorefrontSection,
  type StorefrontStudioDraft,
} from "./studio-draft";
import {
  commitStorefrontStudioHistory,
  createStorefrontStudioHistory,
  redoStorefrontStudioHistory,
  undoStorefrontStudioHistory,
} from "./studio-history";

function draft(): StorefrontStudioDraft {
  return {
    name: "Atlas Store",
    slug: "atlas-store",
    description: "COD storefront",
    theme: createDefaultStorefrontTheme("atlas"),
    selectedProductIds: ["product:1"],
    isActive: true,
  };
}

describe("Storefront Builder V2", () => {
  it("normalizes legacy themes into the strict V2 contract", () => {
    const theme = normalizeStorefrontTheme({
      template: "classic",
      primaryColor: "#123456",
      showPrices: false,
      showStock: true,
    });
    expect(theme.template).toBe("oasis");
    expect(theme.primaryColor).toBe("#123456");
    expect(theme.showPrices).toBe(false);
    expect(theme.builder.composition.sections.map((section) => section.type)).toContain("cod-checkout");
    expect(storefrontStudioThemeSchema.safeParse(theme).success).toBe(true);
  });

  it("preserves intentional brand and content overrides across template changes", () => {
    const atlas = createDefaultStorefrontTheme("atlas");
    atlas.primaryColor = "#123456";
    atlas.hero.headline = "Handmade in Algeria";
    atlas.builder.seo.title = "Atlas SEO";
    const oasis = switchStorefrontTemplate(atlas, "oasis");
    expect(oasis.template).toBe("oasis");
    expect(oasis.primaryColor).toBe("#123456");
    expect(oasis.backgroundColor).not.toBe(atlas.backgroundColor);
    expect(oasis.hero.headline).toBe("Handmade in Algeria");
    expect(oasis.hero.style).toBe("centered");
    expect(oasis.builder.seo.title).toBe("Atlas SEO");
  });

  it("rejects unsafe or ambiguous composition payloads", () => {
    const theme = createDefaultStorefrontTheme();
    const duplicated = structuredClone(theme);
    duplicated.builder.composition.sections[1]!.id = duplicated.builder.composition.sections[0]!.id;
    expect(storefrontStudioThemeSchema.safeParse(duplicated).success).toBe(false);
    expect(storefrontStudioThemeSchema.safeParse({ ...theme, arbitraryHtml: "<script />" }).success).toBe(false);
  });

  it("supports ordered section editing without mutating the prior draft", () => {
    const original = draft();
    const hero = original.theme.builder.composition.sections.find((section) => section.type === "hero")!;
    const hidden = toggleStorefrontSection(original, hero.id);
    expect(hidden.theme.builder.composition.sections.find((section) => section.id === hero.id)?.enabled).toBe(false);
    expect(original.theme.builder.composition.sections.find((section) => section.id === hero.id)?.enabled).toBe(true);

    const moved = moveStorefrontSection(hidden, hero.id, -1);
    expect(moved.theme.builder.composition.sections.findIndex((section) => section.id === hero.id)).toBeLessThan(
      hidden.theme.builder.composition.sections.findIndex((section) => section.id === hero.id),
    );
    const duplicated = duplicateStorefrontSection(moved, hero.id, "section:copy");
    expect(duplicated.theme.builder.composition.sections.some((section) => section.id === "section:copy")).toBe(true);
    const removed = deleteStorefrontSection(duplicated, "section:copy");
    const added = addStorefrontSection(removed, "section:faq", "faq");
    expect(added.theme.builder.composition.sections.at(-1)?.type).toBe("faq");
  });

  it("retains bounded undo and redo history", () => {
    const initial = createStorefrontStudioHistory(draft());
    const renamed = { ...initial.present, name: "Renamed" };
    const committed = commitStorefrontStudioHistory(initial, renamed);
    expect(undoStorefrontStudioHistory(committed).present.name).toBe("Atlas Store");
    expect(redoStorefrontStudioHistory(undoStorefrontStudioHistory(committed)).present.name).toBe("Renamed");
  });

  it("requires a valid, publishable local draft", () => {
    expect(storefrontStudioDraftSchema.safeParse(draft()).success).toBe(true);
    expect(storefrontStudioDraftSchema.safeParse({ ...draft(), selectedProductIds: [] }).success).toBe(false);
  });

  it("removes domain-verification material from public storefront serialization", () => {
    const value = draft();
    value.theme.builder.domain = {
      hostname: "shop.example.com",
      status: "pending",
      verificationName: "_sahelflow.shop.example.com",
      verificationValue: "private-verification-token",
      lastCheckedAt: "2026-08-13T12:00:00.000Z",
    };
    const projected = projectPublicStorefrontConfig({
      id: "storefront_12345678",
      slug: value.slug,
      name: value.name,
      description: value.description,
      theme: value.theme,
      productIds: value.selectedProductIds,
      contact: null,
      isActive: value.isActive,
      createdAt: new Date("2026-08-13T12:00:00.000Z"),
      updatedAt: new Date("2026-08-13T12:00:00.000Z"),
    });
    expect(projected.theme.builder.domain).toEqual({
      hostname: "shop.example.com",
      status: "pending",
      verificationName: null,
      verificationValue: null,
      lastCheckedAt: null,
    });
  });
});
