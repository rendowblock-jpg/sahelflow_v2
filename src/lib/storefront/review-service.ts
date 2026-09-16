import "server-only";

/**
 * Order-verified product reviews service (FD-061 EX-4, slice 2).
 *
 * Contracts extracted from CodFlow's growth/checkout research
 * (documentation/research/CODFLOW_EXTRACTION.md §6, Apache-2.0), re-scoped
 * onto the desktop storefront:
 *   - one review per real order — the UNIQUE orderId is the idempotency
 *     authority; a second submission for the same order converges on the
 *     first row;
 *   - verification is server-authoritative: the buyer identifies the order
 *     by (orderNumber, phone) — both facts a real buyer has — and the
 *     reviewed product must belong to the order; the storefront never
 *     exposes order UUIDs and this service never accepts one;
 *   - moderation lifecycle pending (default) -> approved | rejected; only
 *     approved reviews are publicly displayed;
 *   - the public projection never carries orderId (or any order identity)
 *     — the no-order-UUID pin is structural, not a UI convention.
 *
 * Reviews never mutate Order rows (the phase1 adopted-source source-pin
 * holds) and are never money truth.
 */
import { z } from "zod";

import type { ServiceContext } from "@/lib/data/service-base";
import { readCanonicalSourceOrderAuthority } from "@/lib/orders/manual-order-authority";
import { normalizeDZPhone } from "@/lib/validation/phone";

export const REVIEW_BODY_MAX = 2000;

export const reviewSubmitSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  orderNumber: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(1).max(24),
  productId: z.string().trim().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(1).max(REVIEW_BODY_MAX),
  // The checkout name contract (slice 1): >= 2 chars.
  authorName: z.string().trim().min(2).max(100),
});

export type ReviewSubmitInput = z.infer<typeof reviewSubmitSchema>;

export type ReviewSubmitDisposition =
  | { submitted: true }
  | {
      submitted: false;
      reason:
        | "order_not_found"
        | "wrong_phone"
        | "not_storefront_order"
        | "wrong_storefront"
        | "product_not_in_order"
        | "already_reviewed";
    };

/**
 * Submit the one review a real order earns. Verification is deliberately
 * opaque to the caller: every failure collapses to `submitted: false`
 * (the public route renders one generic message — probing must not learn
 * whether an order number exists).
 */
export async function submitProductReview(
  context: ServiceContext,
  input: ReviewSubmitInput,
): Promise<ReviewSubmitDisposition> {
  const order = await context.prisma.order.findFirst({
    where: { orderNumber: input.orderNumber, deletedAt: null },
    select: {
      id: true,
      phone: true,
      source: true,
      sourceMetadata: true,
      items: { select: { productId: true } },
    },
  });
  if (!order) return { submitted: false, reason: "order_not_found" };

  if (normalizeDZPhone(input.phone) !== order.phone) {
    return { submitted: false, reason: "wrong_phone" };
  }

  const authority = readCanonicalSourceOrderAuthority(
    order.source,
    order.sourceMetadata,
  );
  if (!authority || authority.source !== "storefront") {
    return { submitted: false, reason: "not_storefront_order" };
  }
  if (authority.sourceIdentity !== input.slug) {
    return { submitted: false, reason: "wrong_storefront" };
  }
  if (!order.items.some((item) => item.productId === input.productId)) {
    return { submitted: false, reason: "product_not_in_order" };
  }

  try {
    await context.prisma.productReview.create({
      data: {
        orderId: order.id,
        productId: input.productId,
        storefrontSlug: input.slug,
        authorName: input.authorName,
        rating: input.rating,
        body: input.body,
      },
    });
    return { submitted: true };
  } catch (error) {
    // The UNIQUE orderId is the idempotency authority: a lost response and
    // a retry converge on the first row.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return { submitted: false, reason: "already_reviewed" };
    }
    throw error;
  }
}

export type ReviewModerationAction = "approve" | "reject";

const MODERATION_STATUS: Record<ReviewModerationAction, "approved" | "rejected"> = {
  approve: "approved",
  reject: "rejected",
};

/**
 * Moderate one review. Re-flipping between approved/rejected stays allowed
 * (a seller correcting a mistaken moderation is their own authority);
 * writing the same status twice is a no-op (count 0).
 */
export async function moderateProductReview(
  context: ServiceContext,
  input: { reviewId: string; action: ReviewModerationAction },
): Promise<number> {
  const status = MODERATION_STATUS[input.action];
  const result = await context.prisma.productReview.updateMany({
    where: { id: input.reviewId, status: { not: status } },
    data: { status, moderatedAt: new Date() },
  });
  return result.count;
}

/** The public review projection — structurally free of order identity. */
export interface PublicStorefrontReview {
  id: string;
  productId: string;
  productName: string;
  authorName: string;
  rating: number;
  body: string;
  submittedAt: string;
}

/**
 * Approved reviews for a storefront's products, newest first. The select
 * list is the no-order-UUID pin: orderId is never projected.
 */
export async function listPublicStorefrontReviews(
  context: ServiceContext,
  input: { productIds: string[]; limit?: number },
): Promise<PublicStorefrontReview[]> {
  if (input.productIds.length === 0) return [];
  const reviews = await context.prisma.productReview.findMany({
    where: {
      productId: { in: input.productIds },
      status: "approved",
    },
    orderBy: { submittedAt: "desc" },
    take: input.limit ?? 20,
    select: {
      id: true,
      productId: true,
      authorName: true,
      rating: true,
      body: true,
      submittedAt: true,
      product: { select: { name: true } },
    },
  });
  return reviews.map((review) => ({
    id: review.id,
    productId: review.productId,
    productName: review.product.name,
    authorName: review.authorName,
    rating: review.rating,
    body: review.body,
    submittedAt: review.submittedAt.toISOString(),
  }));
}

/** One moderation-row for the dashboard surface. */
export interface ModeratableReview {
  id: string;
  status: string;
  authorName: string;
  rating: number;
  body: string;
  productName: string;
  orderNumber: string;
  storefrontSlug: string;
  submittedAt: string;
}

/**
 * The seller's moderation queue: pending first (oldest first so a backlog
 * drains in arrival order), then the recently decided tail.
 */
export async function listReviewsForModeration(
  context: ServiceContext,
  input: { limit?: number } = {},
): Promise<ModeratableReview[]> {
  const [pending, decided] = await Promise.all([
    context.prisma.productReview.findMany({
      where: { status: "pending" },
      orderBy: { submittedAt: "asc" },
      take: input.limit ?? 50,
      select: {
        id: true,
        status: true,
        authorName: true,
        rating: true,
        body: true,
        storefrontSlug: true,
        submittedAt: true,
        product: { select: { name: true } },
        order: { select: { orderNumber: true } },
      },
    }),
    context.prisma.productReview.findMany({
      where: { status: { not: "pending" } },
      orderBy: { moderatedAt: "desc" },
      take: input.limit ?? 50,
      select: {
        id: true,
        status: true,
        authorName: true,
        rating: true,
        body: true,
        storefrontSlug: true,
        submittedAt: true,
        product: { select: { name: true } },
        order: { select: { orderNumber: true } },
      },
    }),
  ]);
  const shape = (review: (typeof pending)[number]): ModeratableReview => ({
    id: review.id,
    status: review.status,
    authorName: review.authorName,
    rating: review.rating,
    body: review.body,
    productName: review.product.name,
    orderNumber: review.order.orderNumber,
    storefrontSlug: review.storefrontSlug,
    submittedAt: review.submittedAt.toISOString(),
  });
  return [...pending.map(shape), ...decided.map(shape)];
}
