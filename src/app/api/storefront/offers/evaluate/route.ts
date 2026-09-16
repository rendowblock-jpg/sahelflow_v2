import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import {
  evaluateQuantityTierOffers,
  previewEvaluation,
} from "@/lib/storefront/quantity-tier-service";

export const dynamic = "force-dynamic";

const evaluateSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().min(1).nullable().optional(),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(100),
});

/**
 * FD-061 EX-4: buyer-facing reward preview. Read-only evaluation so the
 * storefront cart can render the earned reward (free shipping / free
 * product) BEFORE checkout commits — the buyer never sees a total the
 * server will not honor. No writes; no personal data; the response is a
 * name-quantified preview, not an order.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const input = evaluateSchema.parse(await request.json());
  const evaluation = await evaluateQuantityTierOffers(
    { prisma: db, shop: shopContext },
    {
      slug: input.slug,
      items: input.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.quantity,
      })),
    },
  );
  return NextResponse.json(previewEvaluation(evaluation));
}, "POST /api/storefront/offers/evaluate");
