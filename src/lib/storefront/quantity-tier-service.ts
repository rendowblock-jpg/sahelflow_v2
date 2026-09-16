import "server-only";

/**
 * Quantity-tier offers service (FD-061 EX-4, slice 3).
 *
 * Contracts extracted from CodFlow's growth/checkout research
 * (documentation/research/CODFLOW_EXTRACTION.md §6, Apache-2.0), re-scoped
 * onto the desktop storefront:
 *   - trigger product/variant/quantity -> reward product/variant/quantity
 *     or free shipping;
 *   - highest trigger wins among the eligible matches;
 *   - reward stock is checked against the live catalog — a product reward
 *     whose stock cannot cover rewardQuantity is disqualified (the next
 *     eligible offer applies, never a broken promise);
 *   - free shipping zeroes the fee.
 *
 * Evaluation is a pure function of (offers, cart, live catalog): the same
 * cart always earns the same reward, so checkout replays converge under
 * the command kernel's idempotency key. The reward enters the kernel as a
 * storefront-authoritative `unitPrice: 0` item (the sanctioned
 * historical-line-pricing channel) — money truth stays in the command;
 * this service never writes Orders.
 */
import { z } from "zod";

import type { ServiceContext } from "@/lib/data/service-base";

export const offerSchema = z
  .object({
    storefrontSlug: z.string().trim().min(1).max(120),
    triggerProductId: z.string().trim().min(1).max(100),
    triggerVariantId: z.string().trim().min(1).max(100).nullable().optional(),
    triggerQuantity: z.number().int().min(2).max(999),
    rewardType: z.enum(["product", "free_shipping"]),
    rewardProductId: z.string().trim().min(1).max(100).nullable().optional(),
    rewardVariantId: z.string().trim().min(1).max(100).nullable().optional(),
    rewardQuantity: z.number().int().min(1).max(999).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.rewardType === "product") {
      if (!value.rewardProductId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rewardProductId"],
          message: "A product reward requires a reward product",
        });
      }
      if (!value.rewardQuantity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rewardQuantity"],
          message: "A product reward requires a reward quantity",
        });
      }
    }
  });

export type OfferInput = z.infer<typeof offerSchema>;

/** The cart items as the storefront checkout sends them. */
export interface CartItemQuantity {
  productId: string;
  variantId: string | null;
  quantity: number;
}

export type TierReward =
  | { type: "free_shipping" }
  | {
      type: "product";
      offerId: string;
      productId: string;
      variantId: string | null;
      quantity: number;
      productName: string;
    };

export type TierEvaluation =
  | { applied: false }
  | {
      applied: true;
      offerId: string;
      triggerQuantity: number;
      reward: TierReward;
    };

/**
 * Evaluate the storefront's active offers against the cart. Among the
 * eligible matches the HIGHEST trigger wins (the research contract);
 * product rewards whose live stock cannot cover the reward quantity are
 * disqualified so the next-best offer applies instead. Deterministic:
 * quantity ties break on offer id so checkout replays converge.
 */
export async function evaluateQuantityTierOffers(
  context: ServiceContext,
  input: { slug: string; items: CartItemQuantity[] },
): Promise<TierEvaluation> {
  const offers = await context.prisma.quantityTierOffer.findMany({
    where: { storefrontSlug: input.slug, isActive: true },
    orderBy: [{ triggerQuantity: "desc" }, { id: "asc" }],
  });
  if (offers.length === 0) return { applied: false };

  // Cart quantity per product (all variants merged) and per (product,
  // variant) — the two matching granularities the research defines.
  const perProduct = new Map<string, number>();
  const perVariant = new Map<string, number>();
  for (const item of input.items) {
    perProduct.set(
      item.productId,
      (perProduct.get(item.productId) ?? 0) + item.quantity,
    );
    if (item.variantId) {
      perVariant.set(
        `${item.productId}:${item.variantId}`,
        (perVariant.get(`${item.productId}:${item.variantId}`) ?? 0) +
          item.quantity,
      );
    }
  }

  const matches = offers.filter((offer) => {
    const productQuantity = perProduct.get(offer.triggerProductId) ?? 0;
    if (offer.triggerVariantId) {
      const variantQuantity =
        perVariant.get(`${offer.triggerProductId}:${offer.triggerVariantId}`) ?? 0;
      return variantQuantity >= offer.triggerQuantity;
    }
    return productQuantity >= offer.triggerQuantity;
  });
  if (matches.length === 0) return { applied: false };

  for (const offer of matches) {
    if (offer.rewardType === "free_shipping") {
      return {
        applied: true,
        offerId: offer.id,
        triggerQuantity: offer.triggerQuantity,
        reward: { type: "free_shipping" },
      };
    }
    // Product reward: live-catalog validation (active + reward stock).
    const rewardProduct = await context.prisma.product.findFirst({
      where: { id: offer.rewardProductId ?? "", isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        stock: true,
        productVariants: {
          where: { isActive: true },
          select: { id: true, stock: true },
        },
      },
    });
    if (!rewardProduct) continue;
    const variant = offer.rewardVariantId
      ? rewardProduct.productVariants.find(
          (candidate) => candidate.id === offer.rewardVariantId,
        )
      : undefined;
    if (offer.rewardVariantId && !variant) continue;
    const availableStock = variant ? variant.stock : rewardProduct.stock;
    if (availableStock < (offer.rewardQuantity ?? 0)) continue;

    return {
      applied: true,
      offerId: offer.id,
      triggerQuantity: offer.triggerQuantity,
      reward: {
        type: "product",
        offerId: offer.id,
        productId: rewardProduct.id,
        variantId: offer.rewardVariantId ?? null,
        quantity: offer.rewardQuantity ?? 0,
        productName: rewardProduct.name,
      },
    };
  }
  return { applied: false };
}

/** The buyer-facing preview (evaluate endpoint) — no internal ids beyond the reward product. */
export interface TierPreview {
  applied: boolean;
  reward:
    | { type: "free_shipping" }
    | { type: "product"; productName: string; quantity: number }
    | null;
}

export function previewEvaluation(evaluation: TierEvaluation): TierPreview {
  if (!evaluation.applied) return { applied: false, reward: null };
  const { reward } = evaluation;
  if (reward.type === "free_shipping") {
    return { applied: true, reward: { type: "free_shipping" } };
  }
  return {
    applied: true,
    reward: {
      type: "product",
      productName: reward.productName,
      quantity: reward.quantity,
    },
  };
}

/** Load offers with trigger/reward product names for the seller surface. */
export async function listQuantityTierOffers(
  context: ServiceContext,
  input: { slug?: string } = {},
) {
  const offers = await context.prisma.quantityTierOffer.findMany({
    where: input.slug ? { storefrontSlug: input.slug } : undefined,
    orderBy: [{ storefrontSlug: "asc" }, { triggerQuantity: "desc" }, { id: "asc" }],
  });
  const productIds = [
    ...new Set(
      offers.flatMap((offer) =>
        [offer.triggerProductId, offer.rewardProductId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
  ];
  const products = await context.prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((product) => [product.id, product.name]));
  return offers.map((offer) => ({
    id: offer.id,
    storefrontSlug: offer.storefrontSlug,
    triggerProductId: offer.triggerProductId,
    triggerProductName: nameById.get(offer.triggerProductId) ?? offer.triggerProductId,
    triggerVariantId: offer.triggerVariantId,
    triggerQuantity: offer.triggerQuantity,
    rewardType: offer.rewardType,
    rewardProductId: offer.rewardProductId,
    rewardProductName: offer.rewardProductId
      ? nameById.get(offer.rewardProductId) ?? offer.rewardProductId
      : null,
    rewardVariantId: offer.rewardVariantId,
    rewardQuantity: offer.rewardQuantity,
    isActive: offer.isActive,
  }));
}
