import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  reviewSubmitSchema,
  submitProductReview,
} from "@/lib/storefront/review-service";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * FD-061 EX-4: public order-verified review submission.
 *
 * The buyer identifies the order by (orderNumber, phone) — both facts a
 * real buyer has; the storefront never sees (or sends) an order UUID. The
 * service verification is server-authoritative, and every verification
 * failure collapses to one generic 403 so probing cannot distinguish
 * "unknown order number" from "wrong phone" or "wrong storefront".
 */

const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipHits) {
      if (now > entry.resetAt) ipHits.delete(ip);
    }
  }, 300_000).unref?.();
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      {
        error: "Too many review submissions. Please try again later.",
        code: "REVIEW_RATE_LIMITED",
      },
      { status: 429 },
    );
  }

  const input = reviewSubmitSchema.parse(await request.json());
  const disposition = await submitProductReview(
    { prisma: db, shop: shopContext },
    input,
  );
  if (disposition.submitted) {
    return NextResponse.json(
      { ok: true, message: "review_received" },
      { status: 201 },
    );
  }
  if (disposition.reason === "already_reviewed") {
    return NextResponse.json(
      {
        error: "This order has already been reviewed.",
        code: "REVIEW_ALREADY_SUBMITTED",
      },
      { status: 409 },
    );
  }
  // One generic verification failure: order_not_found | wrong_phone |
  // not_storefront_order | wrong_storefront | product_not_in_order all
  // present identically — no oracle for probing order numbers.
  return NextResponse.json(
    {
      error: "We could not verify this order for a review.",
      code: "REVIEW_ORDER_NOT_VERIFIED",
    },
    { status: 403 },
  );
}, "POST /api/storefront/reviews");
