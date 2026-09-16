import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { otpVerifySchema, verifyStorefrontOtp } from "@/lib/storefront/otp-service";

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 20;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipHits) {
      if (now > entry.resetAt) ipHits.delete(ip);
    }
  }, 300_000).unref?.();
}

/**
 * FD-061 EX-4: verify a WhatsApp OTP code for storefront checkout. On
 * VERIFIED the server mints the 15-minute HMAC token (type "v") binding
 * the normalized E.164 phone — the buyer's browser presents it to
 * /api/storefront/submit, which enforces phone equality. The 6-digit code
 * itself never appears in any response. Public route: a shopper has no
 * account.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "unknown";
  const input = otpVerifySchema.parse(await request.json());

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please try again later.", code: "OTP_RATE_LIMITED" },
      { status: 429 },
    );
  }

  const result = await verifyStorefrontOtp({ prisma: db, shop: shopContext }, input);
  return NextResponse.json(result);
}, "POST /api/storefront/otp/verify");
