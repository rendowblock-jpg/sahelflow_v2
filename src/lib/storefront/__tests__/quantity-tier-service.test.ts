/**
 * FD-061 EX-4 sandbox DB tests for quantity-tier offers.
 *
 * The slice's contract battery: the research semantics (trigger
 * product/variant/quantity -> reward product/variant/quantity or free
 * shipping), highest-trigger-wins among eligible matches, live-catalog
 * reward-stock disqualification, the deterministic tie-break (checkout
 * replays converge), the buyer-facing preview shape (no internal ids) and
 * the public evaluate route contract. All cases run against the real
 * SQLite schema.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

import {
  evaluateQuantityTierOffers,
  offerSchema,
  previewEvaluation,
  type CartItemQuantity,
} from "@/lib/storefront/quantity-tier-service";
import { POST as evaluateRoute } from "@/app/api/storefront/offers/evaluate/route";
import {
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
} from "@/lib/data/__tests__/helpers";
import type { ServiceContext } from "@/lib/data/service-base";

let db: PrismaClient;
let context: ServiceContext;

beforeEach(async () => {
  db = await createTestPrisma();
  // The shared cleaner predates the EX-4 offers table; clear it so every
  // case starts from an empty configuration.
  await db.quantityTierOffer.deleteMany();
  context = makeContext(db);
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

const SLUG = "tier-store";

let triggerId = "";
let rewardId = "";

async function seedProducts(
  triggerStock = 50,
  rewardStock = 50,
): Promise<{ trigger: string; reward: string }> {
  const trigger = await db.product.create({
    data: { name: "Trigger Product", price: 2000, stock: triggerStock },
  });
  const reward = await db.product.create({
    data: { name: "Reward Product", price: 1500, stock: rewardStock },
  });
  triggerId = trigger.id;
  rewardId = reward.id;
  return { trigger: trigger.id, reward: reward.id };
}

async function createOffer(overrides: Record<string, unknown>) {
  return db.quantityTierOffer.create({
    data: {
      storefrontSlug: SLUG,
      triggerProductId: triggerId,
      triggerQuantity: 2,
      rewardType: "free_shipping",
      ...overrides,
    },
  });
}

function cart(items: CartItemQuantity[]): CartItemQuantity[] {
  return items;
}

describe("offer schema", () => {
  it("requires reward product and quantity exactly for product rewards", () => {
    expect(
      offerSchema.safeParse({
        storefrontSlug: SLUG,
        triggerProductId: "p1",
        triggerQuantity: 2,
        rewardType: "product",
        rewardProductId: "p2",
        rewardQuantity: 1,
      }).success,
    ).toBe(true);
    expect(
      offerSchema.safeParse({
        storefrontSlug: SLUG,
        triggerProductId: "p1",
        triggerQuantity: 2,
        rewardType: "product",
      }).success,
    ).toBe(false);
    expect(
      offerSchema.safeParse({
        storefrontSlug: SLUG,
        triggerProductId: "p1",
        triggerQuantity: 2,
        rewardType: "product",
        rewardProductId: "p2",
      }).success,
    ).toBe(false);
    expect(
      offerSchema.safeParse({
        storefrontSlug: SLUG,
        triggerProductId: "p1",
        triggerQuantity: 2,
        rewardType: "free_shipping",
      }).success,
    ).toBe(true);
    expect(
      offerSchema.safeParse({
        storefrontSlug: SLUG,
        triggerProductId: "p1",
        triggerQuantity: 1,
        rewardType: "free_shipping",
      }).success,
    ).toBe(false); // a tier needs at least 2 of the trigger product
  });
});

describe("tier evaluation", () => {
  it("applies free shipping when the trigger quantity is met", async () => {
    await seedProducts();
    await createOffer({});
    const evaluation = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: null, quantity: 2 }]),
    });
    expect(evaluation.applied).toBe(true);
    if (evaluation.applied) {
      expect(evaluation.reward.type).toBe("free_shipping");
    }
  });

  it("does not apply below the trigger quantity", async () => {
    await seedProducts();
    await createOffer({});
    const evaluation = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: null, quantity: 1 }]),
    });
    expect(evaluation).toEqual({ applied: false });
  });

  it("merges variant quantities for a product-level trigger", async () => {
    await seedProducts();
    await createOffer({});
    const variantA = await db.productVariant.create({
      data: { productId: triggerId, name: "Red", stock: 10 },
    });
    const variantB = await db.productVariant.create({
      data: { productId: triggerId, name: "Blue", stock: 10 },
    });
    const evaluation = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([
        { productId: triggerId, variantId: variantA.id, quantity: 1 },
        { productId: triggerId, variantId: variantB.id, quantity: 1 },
      ]),
    });
    expect(evaluation.applied).toBe(true);
  });

  it("respects a variant-targeted trigger", async () => {
    await seedProducts();
    const variant = await db.productVariant.create({
      data: { productId: triggerId, name: "Red", stock: 10 },
    });
    await db.productVariant.create({
      data: { productId: triggerId, name: "Blue", stock: 10 },
    });
    await createOffer({ triggerVariantId: variant.id, triggerQuantity: 2 });

    const wrongVariant = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([
        {
          productId: triggerId,
          variantId: (await db.productVariant.findFirstOrThrow({
            where: { productId: triggerId, name: "Blue" },
          })).id,
          quantity: 5,
        },
      ]),
    });
    expect(wrongVariant).toEqual({ applied: false });

    const rightVariant = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: variant.id, quantity: 2 }]),
    });
    expect(rightVariant.applied).toBe(true);
  });

  it("applies the highest trigger among eligible matches", async () => {
    await seedProducts();
    const low = await createOffer({ triggerQuantity: 2, rewardType: "free_shipping" });
    const high = await createOffer({
      triggerQuantity: 5,
      rewardType: "product",
      rewardProductId: rewardId,
      rewardQuantity: 1,
    });

    const evaluation = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: null, quantity: 5 }]),
    });
    expect(evaluation.applied).toBe(true);
    if (evaluation.applied && evaluation.reward.type === "product") {
      expect(evaluation.offerId).toBe(high.id);
      expect(evaluation.reward.productId).toBe(rewardId);
      expect(evaluation.reward.quantity).toBe(1);
      expect(evaluation.reward.productName).toBe("Reward Product");
    } else {
      throw new Error("expected the higher product reward to win");
    }

    // Below the high trigger, the low offer applies again.
    const smaller = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: null, quantity: 2 }]),
    });
    expect(smaller.applied).toBe(true);
    if (smaller.applied) {
      expect(smaller.offerId).toBe(low.id);
      expect(smaller.reward.type).toBe("free_shipping");
    }
  });

  it("disqualifies a product reward whose live stock cannot cover the reward", async () => {
    // Reward stock 1 cannot cover a reward quantity of 2 -> the offer is
    // skipped and the next-best eligible (free shipping) applies.
    await seedProducts(50, 1);
    const rich = await createOffer({
      triggerQuantity: 5,
      rewardType: "product",
      rewardProductId: rewardId,
      rewardQuantity: 2,
    });
    const fallback = await createOffer({ triggerQuantity: 2, rewardType: "free_shipping" });

    const evaluation = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: null, quantity: 5 }]),
    });
    expect(evaluation.applied).toBe(true);
    if (evaluation.applied) {
      expect(evaluation.offerId).toBe(fallback.id);
      expect(evaluation.offerId).not.toBe(rich.id);
    }
  });

  it("ignores inactive offers and other storefronts' offers", async () => {
    await seedProducts();
    await createOffer({ isActive: false });
    await createOffer({ storefrontSlug: "other-store" });
    const evaluation = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: null, quantity: 10 }]),
    });
    expect(evaluation).toEqual({ applied: false });
  });

  it("breaks trigger-quantity ties deterministically on offer id", async () => {
    await seedProducts();
    const second = await createOffer({ triggerQuantity: 2, rewardType: "free_shipping" });
    const first = await createOffer({
      triggerQuantity: 2,
      rewardType: "product",
      rewardProductId: rewardId,
      rewardQuantity: 1,
    });

    const evaluation = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: null, quantity: 2 }]),
    });
    expect(evaluation.applied).toBe(true);
    if (evaluation.applied) {
      // Deterministic tie-break so checkout replays converge: the smaller
      // id wins regardless of insertion order.
      expect(evaluation.offerId).toBe([first.id, second.id].sort()[0]);
    }
  });
});

describe("buyer-facing preview", () => {
  it("projects names and quantities only — no offer or product ids", async () => {
    await seedProducts();
    await createOffer({
      triggerQuantity: 2,
      rewardType: "product",
      rewardProductId: rewardId,
      rewardQuantity: 2,
    });
    const evaluation = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: null, quantity: 2 }]),
    });
    const preview = previewEvaluation(evaluation);
    expect(preview).toEqual({
      applied: true,
      reward: { type: "product", productName: "Reward Product", quantity: 2 },
    });
    expect(JSON.stringify(preview)).not.toContain(rewardId);
    expect(JSON.stringify(preview)).not.toContain(triggerId);
  });

  it("previews free shipping", async () => {
    await seedProducts();
    await createOffer({});
    const evaluation = await evaluateQuantityTierOffers(context, {
      slug: SLUG,
      items: cart([{ productId: triggerId, variantId: null, quantity: 3 }]),
    });
    expect(previewEvaluation(evaluation)).toEqual({
      applied: true,
      reward: { type: "free_shipping" },
    });
  });
});

describe("public evaluate route contract", () => {
  function postRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/storefront/offers/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns the preview for a valid cart", async () => {
    await seedProducts();
    await createOffer({});
    const response = await evaluateRoute(
      postRequest({
        slug: SLUG,
        items: [{ productId: triggerId, variantId: null, quantity: 4 }],
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { applied?: boolean };
    expect(payload.applied).toBe(true);
  });

  it("answers 400 on a malformed body", async () => {
    const response = await evaluateRoute(postRequest({ slug: SLUG, items: "nope" }));
    expect(response.status).toBe(400);
  });
});
