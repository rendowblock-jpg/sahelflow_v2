import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { getPublicStorefrontGates } from "@/lib/storefront/gates-service";

export const dynamic = "force-dynamic";

const readSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

/**
 * FD-061 EX-4: the buyer-facing gate probe — booleans and the PUBLIC
 * Turnstile site key only. The storefront checkout renders the widget and
 * the OTP flow from this; no secret material is ever exposed. Public
 * route: a shopper has no account.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const input = readSchema.parse({
    slug: req.nextUrl.searchParams.get("slug") ?? undefined,
  });
  const gates = await getPublicStorefrontGates(
    { prisma: db, shop: shopContext },
    input.slug,
  );
  return NextResponse.json(gates);
}, "GET /api/storefront/gates/public");
