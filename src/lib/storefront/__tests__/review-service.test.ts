/**
 * FD-061 EX-4 sandbox DB tests for the order-verified review service.
 *
 * The slice's contract battery: the one-review-per-order idempotency
 * authority (UNIQUE orderId), the server-side verification matrix
 * ((orderNumber, phone) — both facts a real buyer holds), moderation
 * transitions (pending -> approved | rejected, idempotent and correctable),
 * the order-identity-free public projection (the storefront never exposes
 * order UUIDs — structural, not a UI convention) and the public route's
 * coded failure contract. All cases run against the real SQLite schema.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import type { z } from "zod";

import {
  listPublicStorefrontReviews,
  listReviewsForModeration,
  moderateProductReview,
  reviewSubmitSchema,
  submitProductReview,
} from "@/lib/storefront/review-service";
import { POST as reviewsRoute } from "@/app/api/storefront/reviews/route";
import {
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
  seedProduct,
} from "@/lib/data/__tests__/helpers";
import { CANONICAL_SOURCE_ORDER_AUTHORITY } from "@/lib/orders/manual-order-authority";
import type { ServiceContext } from "@/lib/data/service-base";

let db: PrismaClient;
let context: ServiceContext;

beforeEach(async () => {
  db = await createTestPrisma();
  // The shared cleaner predates the EX-4 review table; clear it so every
  // case starts from an empty moderation queue.
  await db.productReview.deleteMany();
  context = makeContext(db);
  buyerCustomerId = null;
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

const SLUG = "review-store";
const BUYER_PHONE = "0555123456";
let seededProductId = "seeded-below";
let buyerCustomerId: string | null = null;

async function seedCatalog() {
  const product = await seedProduct(db, { name: "Seeded Product", price: 2500 });
  seededProductId = product.id;
  await db.storefrontConfig.create({
    data: {
      slug: SLUG,
      name: "Review Storefront",
      theme: JSON.stringify({ template: "minimal", primaryColor: "#111111" }),
      productIds: JSON.stringify([product.id]),
      isActive: true,
    },
  });
  return product;
}

/** One buyer per test case — Customer.phone's blind index is UNIQUE. */
async function buyerCustomer() {
  if (!buyerCustomerId) {
    buyerCustomerId = (
      await db.customer.create({
        data: {
          name: "Ahmed Benali",
          phone: BUYER_PHONE,
          nameBlindIndex: "review-test-customer",
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "1 Review Street",
        },
      })
    ).id;
  }
  return buyerCustomerId;
}

/** A committed storefront-source order (canonical-source-v1 metadata). */
async function seedStorefrontOrder(opts?: {
  slug?: string;
  phone?: string;
  orderNumber?: string;
  deletedAt?: Date;
  productIds?: string[];
}) {
  const customerId = await buyerCustomer();
  const productIds = opts?.productIds ?? [seededProductId];
  return db.order.create({
    data: {
      orderNumber: opts?.orderNumber ?? "ORD-9001",
      status: "confirmed",
      customerId,
      totalPrice: 5000,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "1 Review Street",
      phone: opts?.phone ?? BUYER_PHONE,
      source: "storefront",
      sourceMetadata: JSON.stringify({
        authority: CANONICAL_SOURCE_ORDER_AUTHORITY,
        source: "storefront",
        sourceIdentity: opts?.slug ?? SLUG,
        sourceOrderId: "11111111-1111-4111-8111-111111111111",
      }),
      deletedAt: opts?.deletedAt ?? null,
      items: {
        create: productIds.map((productId) => ({
          productId,
          productName: "Seeded Product",
          quantity: 1,
          unitPrice: 2500,
          total: 2500,
        })),
      },
    },
    include: { items: true },
  });
}

function reviewInput(
  overrides: Partial<z.input<typeof reviewSubmitSchema>> = {},
): z.input<typeof reviewSubmitSchema> {
  return {
    slug: SLUG,
    orderNumber: "ORD-9001",
    phone: BUYER_PHONE,
    productId: seededProductId,
    rating: 5,
    body: "Excellent product, fast delivery.",
    authorName: "Ahmed Benali",
    ...overrides,
  };
}

describe("review submission validation", () => {
  it("applies the zod review schema exactly", () => {
    expect(reviewSubmitSchema.safeParse(reviewInput({ rating: 0 })).success).toBe(false);
    expect(reviewSubmitSchema.safeParse(reviewInput({ rating: 6 })).success).toBe(false);
    expect(reviewSubmitSchema.safeParse(reviewInput({ authorName: "A" })).success).toBe(false);
    expect(reviewSubmitSchema.safeParse(reviewInput({ body: "   " })).success).toBe(false);
    expect(reviewSubmitSchema.safeParse(reviewInput()).success).toBe(true);
  });
});

describe("order-verified submission matrix", () => {
  it("accepts a real storefront order and lands the review as pending", async () => {
    await seedCatalog();
    const order = await seedStorefrontOrder();

    const disposition = await submitProductReview(
      context,
      reviewSubmitSchema.parse(reviewInput()),
    );
    expect(disposition).toEqual({ submitted: true });

    const row = await db.productReview.findUnique({ where: { orderId: order.id } });
    expect(row).toMatchObject({
      orderId: order.id,
      productId: seededProductId,
      storefrontSlug: SLUG,
      status: "pending",
      rating: 5,
      authorName: "Ahmed Benali",
    });
    expect(row?.moderatedAt).toBeNull();
  });

  it("rejects an unknown order number without creating a row", async () => {
    await seedCatalog();
    await seedStorefrontOrder();
    const disposition = await submitProductReview(
      context,
      reviewSubmitSchema.parse(reviewInput({ orderNumber: "ORD-4040" })),
    );
    expect(disposition).toEqual({ submitted: false, reason: "order_not_found" });
    expect(await db.productReview.count()).toBe(0);
  });

  it("rejects a wrong phone — the buyer's second verification fact", async () => {
    await seedCatalog();
    await seedStorefrontOrder();
    const disposition = await submitProductReview(
      context,
      reviewSubmitSchema.parse(reviewInput({ phone: "0699887766" })),
    );
    expect(disposition).toEqual({ submitted: false, reason: "wrong_phone" });
    expect(await db.productReview.count()).toBe(0);
  });

  it("rejects non-storefront orders even with the matching phone", async () => {
    await seedCatalog();
    await db.order.create({
      data: {
        orderNumber: "ORD-9002",
        status: "confirmed",
        customerId: await buyerCustomer(),
        totalPrice: 5000,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "2 Review Street",
        phone: BUYER_PHONE,
        source: "manual",
      },
    });
    const disposition = await submitProductReview(
      context,
      reviewSubmitSchema.parse(reviewInput({ orderNumber: "ORD-9002" })),
    );
    expect(disposition).toEqual({ submitted: false, reason: "not_storefront_order" });
    expect(await db.productReview.count()).toBe(0);
  });

  it("rejects reviews addressed to a different storefront", async () => {
    await seedCatalog();
    await seedStorefrontOrder({ slug: "other-shop" });
    const disposition = await submitProductReview(
      context,
      reviewSubmitSchema.parse(reviewInput()),
    );
    expect(disposition).toEqual({ submitted: false, reason: "wrong_storefront" });
    expect(await db.productReview.count()).toBe(0);
  });

  it("rejects products the order does not contain", async () => {
    await seedCatalog();
    await seedStorefrontOrder();
    // Category-less stranger product: seedProduct would re-create the shared
    // fixture category (UNIQUE name) — create directly here.
    const stranger = await db.product.create({
      data: { name: "Stranger Product", price: 900, stock: 10 },
    });
    const disposition = await submitProductReview(
      context,
      reviewSubmitSchema.parse(
        reviewInput({ productId: stranger.id }),
      ),
    );
    expect(disposition).toEqual({ submitted: false, reason: "product_not_in_order" });
    expect(await db.productReview.count()).toBe(0);
  });

  it("treats a soft-deleted order as never ordered", async () => {
    await seedCatalog();
    await seedStorefrontOrder({ deletedAt: new Date() });
    const disposition = await submitProductReview(
      context,
      reviewSubmitSchema.parse(reviewInput()),
    );
    expect(disposition).toEqual({ submitted: false, reason: "order_not_found" });
    expect(await db.productReview.count()).toBe(0);
  });

  it("keeps one review per order — a retry converges on the first row", async () => {
    await seedCatalog();
    const order = await seedStorefrontOrder();

    expect(
      await submitProductReview(context, reviewSubmitSchema.parse(reviewInput())),
    ).toEqual({ submitted: true });
    expect(
      await submitProductReview(
        context,
        reviewSubmitSchema.parse(
          reviewInput({ rating: 1, body: "Retry after a lost response." }),
        ),
      ),
    ).toEqual({ submitted: false, reason: "already_reviewed" });

    const rows = await db.productReview.findMany({ where: { orderId: order.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe(5);
  });
});

describe("moderation lifecycle", () => {
  it("moves pending -> approved -> (correction) rejected and stays idempotent", async () => {
    await seedCatalog();
    await seedStorefrontOrder();
    await submitProductReview(context, reviewSubmitSchema.parse(reviewInput()));
    const row = await db.productReview.findFirstOrThrow();

    expect(await moderateProductReview(context, { reviewId: row.id, action: "approve" })).toBe(1);
    expect(
      await moderateProductReview(context, { reviewId: row.id, action: "approve" }),
    ).toBe(0); // writing the same status twice is a no-op

    // A seller correcting a mistaken moderation is their own authority.
    expect(await moderateProductReview(context, { reviewId: row.id, action: "reject" })).toBe(1);
    const moderated = await db.productReview.findUnique({ where: { id: row.id } });
    expect(moderated?.status).toBe("rejected");
    expect(moderated?.moderatedAt).not.toBeNull();
  });

  it("moderating an unknown review id is a no-op", async () => {
    expect(
      await moderateProductReview(context, {
        reviewId: "missing-review-id",
        action: "approve",
      }),
    ).toBe(0);
  });
});

describe("public projection (order-identity-free)", () => {
  it("returns only approved reviews, newest first, never an order UUID", async () => {
    await seedCatalog();
    const other = await db.product.create({
      data: { name: "Other Product", price: 900, stock: 10 },
    });
    await seedStorefrontOrder({ productIds: [seededProductId, other.id] });
    await submitProductReview(context, reviewSubmitSchema.parse(reviewInput()));
    const row = await db.productReview.findFirstOrThrow();

    const older = await db.productReview.create({
      data: {
        orderId: (
          await seedStorefrontOrder({ orderNumber: "ORD-9003", productIds: [seededProductId] })
        ).id,
        productId: seededProductId,
        storefrontSlug: SLUG,
        authorName: "Older Reviewer",
        rating: 4,
        body: "Good.",
        status: "approved",
        submittedAt: new Date(Date.now() - 60_000),
        moderatedAt: new Date(),
      },
    });

    // Pending rows are never publicly visible — only the pre-approved one.
    const visibleBeforeModeration = await listPublicStorefrontReviews(context, {
      productIds: [seededProductId],
    });
    expect(visibleBeforeModeration.map((review) => review.authorName)).toEqual([
      "Older Reviewer",
    ]);

    await moderateProductReview(context, { reviewId: row.id, action: "approve" });
    await moderateProductReview(context, { reviewId: older.id, action: "approve" });

    const reviews = await listPublicStorefrontReviews(context, {
      productIds: [seededProductId, other.id],
    });
    expect(reviews.map((review) => review.authorName)).toEqual([
      "Ahmed Benali",
      "Older Reviewer",
    ]);
    for (const review of reviews) {
      // The structural no-order-UUID pin: the public payload's exact key set.
      expect(Object.keys(review).sort()).toEqual([
        "authorName",
        "body",
        "id",
        "productId",
        "productName",
        "rating",
        "submittedAt",
      ]);
      expect(JSON.stringify(review)).not.toContain(row.orderId);
    }
  });

  it("returns an empty list for an empty product set", async () => {
    expect(await listPublicStorefrontReviews(context, { productIds: [] })).toEqual([]);
  });
});

describe("moderation queue listing", () => {
  it("lists pending first (oldest first), then the decided tail, with product and order facts", async () => {
    await seedCatalog();
    await seedStorefrontOrder();
    await submitProductReview(context, reviewSubmitSchema.parse(reviewInput()));
    const pendingRow = await db.productReview.findFirstOrThrow();

    const decided = await db.productReview.create({
      data: {
        orderId: (
          await seedStorefrontOrder({ orderNumber: "ORD-9004", productIds: [seededProductId] })
        ).id,
        productId: seededProductId,
        storefrontSlug: SLUG,
        authorName: "Decided Reviewer",
        rating: 2,
        body: "Late delivery.",
        status: "approved",
        moderatedAt: new Date(Date.now() - 30_000),
      },
    });

    const queue = await listReviewsForModeration(context);
    expect(queue.map((review) => review.id)).toEqual([pendingRow.id, decided.id]);
    expect(queue[0]).toMatchObject({
      status: "pending",
      orderNumber: "ORD-9001",
      productName: "Seeded Product",
      storefrontSlug: SLUG,
    });
  });
});

describe("public review route contract", () => {
  function postRequest(body: unknown, ip = "203.0.113.10"): NextRequest {
    return new NextRequest("http://localhost/api/storefront/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("answers 201 on a verified review", async () => {
    await seedCatalog();
    await seedStorefrontOrder();
    const response = await reviewsRoute(postRequest(reviewInput()));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { ok?: boolean };
    expect(payload.ok).toBe(true);
  });

  it("answers one generic 403 for every verification failure — no probing oracle", async () => {
    await seedCatalog();
    await seedStorefrontOrder();

    const unknownOrder = await reviewsRoute(
      postRequest(reviewInput({ orderNumber: "ORD-4040" }), "203.0.113.21"),
    );
    const wrongPhone = await reviewsRoute(
      postRequest(reviewInput({ phone: "0699887766" }), "203.0.113.22"),
    );
    expect(unknownOrder.status).toBe(403);
    expect(wrongPhone.status).toBe(403);
    // Identical bodies: a prober cannot distinguish unknown order from wrong phone.
    expect(await unknownOrder.json()).toEqual(await wrongPhone.json());
  });

  it("answers 409 REVIEW_ALREADY_SUBMITTED on the second review", async () => {
    await seedCatalog();
    await seedStorefrontOrder();
    await reviewsRoute(postRequest(reviewInput(), "203.0.113.31"));
    const second = await reviewsRoute(postRequest(reviewInput(), "203.0.113.32"));
    expect(second.status).toBe(409);
    const payload = (await second.json()) as { code?: string };
    expect(payload.code).toBe("REVIEW_ALREADY_SUBMITTED");
  });

  it("answers 400 on a malformed body", async () => {
    const response = await reviewsRoute(postRequest("{not json", "203.0.113.41"));
    expect(response.status).toBe(400);
  });
});
