import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { captureSchema, upsertAbandonedCartCapture } from "@/lib/storefront/abandoned-cart-service";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * FD-061 EX-4: public abandoned-cart capture endpoint.
 *
 * Receives the storefront's debounced capture (3 s) and the `pagehide`
 * sendBeacon. Beacon requests arrive as text/plain blobs, so the body is
 * read as text and parsed as JSON regardless of content type. The response
 * is always 204 — capture is a side-channel (never money truth) and the
 * beacon cannot read a response body anyway. Validation failures and
 * capture skips (inactive storefront, unavailable product, invalid phone)
 * are swallowed: a lost capture costs at most one recovery opportunity,
 * never a checkout.
 */

const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 60;
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
  try {
    const ip =
      request.headers.get("cf-connecting-ip")?.trim() ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip")?.trim() ??
      "unknown";
    if (!checkRateLimit(ip)) return new NextResponse(null, { status: 204 });

    const input = captureSchema.parse(
      JSON.parse(await request.text()) as unknown,
    );
    await upsertAbandonedCartCapture({ prisma: db, shop: shopContext }, input);
  } catch {
    // Fire-and-forget by design: capture failures never surface to the
    // buyer and never block the storefront.
  }
  return new NextResponse(null, { status: 204 });
}, "POST /api/storefront/cart-capture");
