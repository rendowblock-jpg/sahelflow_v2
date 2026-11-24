import { describe, expect, it } from "vitest";
import { createDefaultStorefrontTheme } from "./theme-default";
import {
  createStorefrontStudioDraft,
  splitDraftPrivateFromThemeJson,
  studioThemeForWire,
  type StorefrontStudioDraft,
} from "./studio-draft";
import { storefrontStudioDraftSchema } from "./studio-schema";
import {
  offerLadderFromQuantityTiers,
  offersPublishBlock,
  saleItemsFromStudioProducts,
  validateItemOfferLadder,
} from "./studio-offers";
import { createStorefrontReleaseInput, storefrontReleaseItemKey } from "./release-artifact";

function sampleDraft(offers?: StorefrontStudioDraft["offers"]): StorefrontStudioDraft {
  const theme = createDefaultStorefrontTheme("lumen");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 400 }];
  return {
    name: "Sahel Demo",
    slug: "sahel-demo",
    description: "Demo",
    theme,
    selectedProductIds: ["prod_1"],
    isActive: true,
    ...(offers ? { offers } : {}),
  };
}

describe("Quantity Offers M3: studio schema, wire roundtrip, publish artifact, and desktop tier mapping", () => {
  it("accepts valid ladders and rejects unsorted/duplicate/over-limit ladders in studio draft schema", () => {
    const valid = sampleDraft({
      prod_1: [
        { q: 2, t: 5500 },
        { q: 3, t: 7500 },
      ],
    });
    expect(storefrontStudioDraftSchema.safeParse(valid).success).toBe(true);

    const unsorted = sampleDraft({
      prod_1: [
        { q: 3, t: 7500 },
        { q: 2, t: 5500 },
      ],
    });
    expect(storefrontStudioDraftSchema.safeParse(unsorted).success).toBe(false);

    const dup = sampleDraft({
      prod_1: [
        { q: 2, t: 5500 },
        { q: 2, t: 5000 },
      ],
    });
    expect(storefrontStudioDraftSchema.safeParse(dup).success).toBe(false);

    const tooMany = sampleDraft({
      prod_1: [
        { q: 2, t: 100 },
        { q: 3, t: 150 },
        { q: 4, t: 200 },
        { q: 5, t: 250 },
        { q: 6, t: 300 },
        { q: 7, t: 350 },
      ],
    });
    expect(storefrontStudioDraftSchema.safeParse(tooMany).success).toBe(false);
  });

  it("roundtrips offers via studioThemeForWire / splitDraftPrivateFromThemeJson / createStorefrontStudioDraft without changing drafts without offers", () => {
    const plain = sampleDraft();
    const plainWire = studioThemeForWire(plain);
    expect("offers" in plainWire.builder).toBe(false);

    const withOffers = sampleDraft({ prod_1: [{ q: 2, t: 5500 }] });
    const wire = studioThemeForWire(withOffers);
    expect(wire.builder.offers).toEqual({ prod_1: [{ q: 2, t: 5500 }] });

    const split = splitDraftPrivateFromThemeJson(wire);
    expect(split.offers).toEqual({ prod_1: [{ q: 2, t: 5500 }] });
    expect("offers" in (split.theme as { builder: Record<string, unknown> }).builder).toBe(false);

    const reloaded = createStorefrontStudioDraft({
      id: "sf_1",
      name: withOffers.name,
      slug: withOffers.slug,
      description: withOffers.description,
      theme: wire,
      productIds: withOffers.selectedProductIds,
      isActive: true,
      contact: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    expect(reloaded.offers).toEqual({ prod_1: [{ q: 2, t: 5500 }] });
    expect("offers" in reloaded.theme.builder).toBe(false);
  });

  it("emits draft.offers into release allocations[] while keeping publicArtifact.theme.builder free of offers", () => {
    const itemKey = storefrontReleaseItemKey("prod_1", null);
    const draft = sampleDraft({
      [itemKey]: [
        { q: 2, t: 5500 },
        { q: 3, t: 7500 },
      ],
    });
    const req = createStorefrontReleaseInput({
      workspaceId: "ws_1",
      releaseId: "rel_1",
      parentReleaseId: null,
      locale: "fr",
      draft,
      products: [
        {
          id: "prod_1",
          name: "Sneaker",
          price: 3000,
          stock: 10,
          sku: null,
          description: null,
          images: null,
        },
      ],
    }) as {
      publicArtifact: { theme: { builder: Record<string, unknown> } };
      allocations: Array<{ itemKey: string; offers?: Array<{ q: number; t: number }> }>;
    };

    expect("offers" in req.publicArtifact.theme.builder).toBe(false);
    expect(req.allocations[0]?.offers).toEqual([
      { q: 2, t: 5500 },
      { q: 3, t: 7500 },
    ]);
  });

  it("flags stale ladders after a product price drop and blocks publish", () => {
    const products = [{ id: "prod_1", name: "Jacket", price: 2500 }];
    const items = saleItemsFromStudioProducts(products, ["prod_1"]);
    // Ladder was created when unit price was 3000 (2 for 5500); now 2 * 2500 = 5000 <= 5500!
    const check = validateItemOfferLadder(2500, [{ q: 2, t: 5500 }]);
    expect(check).toEqual({ ok: false, reason: "stale_price" });

    const itemKey = storefrontReleaseItemKey("prod_1", null);
    expect(items[0]?.itemKey).toBe(itemKey);
    const block = offersPublishBlock({ [itemKey]: [{ q: 2, t: 5500 }] }, items);
    expect(block).toEqual({
      messageKey: "storefront.offersPanel.staleBlock",
      invalidItemKeys: [itemKey],
    });
  });

  it("maps same-product desktop QuantityTierOffers to hosted bundles and skips free-shipping / cross-product tiers with reasons", () => {
    const mapped = offerLadderFromQuantityTiers({
      unitPrice: 3000,
      productId: "prod_1",
      variantId: null,
      tiers: [
        {
          id: "t1",
          triggerProductId: "prod_1",
          triggerVariantId: null,
          triggerQuantity: 2,
          rewardType: "product",
          rewardProductId: "prod_1",
          rewardVariantId: null,
          rewardQuantity: 1,
          isActive: true,
        },
        {
          id: "t2",
          triggerProductId: "prod_1",
          triggerVariantId: null,
          triggerQuantity: 3,
          rewardType: "free_shipping",
          rewardProductId: null,
          rewardVariantId: null,
          rewardQuantity: 1,
          isActive: true,
        },
        {
          id: "t3",
          triggerProductId: "prod_1",
          triggerVariantId: null,
          triggerQuantity: 2,
          rewardType: "product",
          rewardProductId: "prod_other",
          rewardVariantId: null,
          rewardQuantity: 1,
          isActive: true,
        },
      ],
    });
    expect(mapped.tiers).toEqual([{ q: 3, t: 6000 }]);
    expect(mapped.skipped).toEqual([
      { id: "t2", reason: "free_shipping" },
      { id: "t3", reason: "different_product" },
    ]);
  });
});
