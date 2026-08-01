import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { assessOrderRiskPreCreate } from "@/lib/risk-engine";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * W3-4 (task 2-g): request body schema for POST /api/risk/assess-pre-create.
 *
 * Mirrors `PreCreateOrderData` from `@/lib/risk-engine/service`. Kept in sync
 * by hand (the type isn't exported as a zod schema — it's a TS interface, so
 * we duplicate the shape here for request validation).
 *
 * `items` is optional + permissive (the scoring engine doesn't currently use
 * it — it's reserved for future item-based factors like "customer has never
 * ordered this product before").
 */
const preCreateSchema = z.object({
  phone: z.string().min(1, "phone is required"),
  wilaya: z.string().min(1, "wilaya is required"),
  commune: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  totalPrice: z.number().nonnegative(),
  source: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .optional(),
});

/**
 * POST /api/risk/assess-pre-create
 *
 * W3-4 (task 2-g): pre-create risk assessment. Takes the order-form data
 * (customer phone, wilaya, items, total) BEFORE the order is saved and
 * returns a full RiskAssessment — same factors, same scoring, same rules
 * as the post-create `GET /api/risk/assess/[orderId]`.
 *
 * The caller (manual order form, storefront) can use the returned `score`
 * and `level` to decide whether to show a confirmation dialog:
 *   - score > 70 (HIGH/CRITICAL) → show "This order has HIGH risk... Do you
 *     still want to create this order?" dialog with the factor breakdown.
 *   - score ≤ 70 → proceed silently.
 *
 * This endpoint NEVER blocks order creation — it returns an assessment, and
 * the caller decides what to do with it. The risk is a WARNING, not a gate.
 *
 * Auth: requires an authenticated session (seller or admin). The storefront
 * path uses its own public endpoint (with reCAPTCHA + rate-limit) — this
 * endpoint is for the in-app order form only.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("risk.read");
  const body = await req.json();
  const input = preCreateSchema.parse(body);

  const assessment = await assessOrderRiskPreCreate(
    { prisma: db, shop: shopContext },
    {
      phone: input.phone,
      wilaya: input.wilaya,
      commune: input.commune ?? null,
      address: input.address ?? null,
      totalPrice: input.totalPrice,
      source: input.source ?? "manual",
      items: input.items,
    },
  );

  return NextResponse.json({ assessment });
}, "POST /api/risk/assess-pre-create");
