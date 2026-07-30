import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setActiveShopId } from "@/lib/shops";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

const setActiveSchema = z.object({
  shopId: z.string().min(1),
});

/**
 * PUT /api/shops/active — set the active shop.
 * Body: { shopId: string }
 */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedActor();
  const body = await req.json();
  const input = setActiveSchema.parse(body);
  assertTrustedAction(actorContext, "shops.switch", { shopId: input.shopId });
  setActiveShopId(input.shopId);
  return NextResponse.json({
    status: "pending",
    processShopId: process.env.SF_ACTIVE_SHOP_ID ?? null,
    requestedShopId: input.shopId,
    relaunchRequired: true,
  });
}, "PUT /api/shops/active");
