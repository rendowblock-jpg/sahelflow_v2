import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import {
  listQuantityTierOffers,
  offerSchema,
} from "@/lib/storefront/quantity-tier-service";

export const dynamic = "force-dynamic";

const listSchema = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
});

/**
 * FD-061 EX-4: seller management of quantity-tier offers.
 * GET  — list (optionally per storefront), with trigger/reward product names.
 * POST — create one offer (storefront.manage).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireTrustedAction("storefront.read");
  const slug = listSchema.parse({
    slug: req.nextUrl.searchParams.get("slug") ?? undefined,
  });
  const offers = await listQuantityTierOffers(
    { prisma: db, shop: shopContext },
    slug,
  );
  return NextResponse.json({ offers });
}, "GET /api/storefront/offers");

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("storefront.manage");
  const input = offerSchema.parse(await req.json());

  const offer = await db.quantityTierOffer.create({
    data: {
      storefrontSlug: input.storefrontSlug,
      triggerProductId: input.triggerProductId,
      triggerVariantId: input.triggerVariantId ?? null,
      triggerQuantity: input.triggerQuantity,
      rewardType: input.rewardType,
      rewardProductId: input.rewardProductId ?? null,
      rewardVariantId: input.rewardVariantId ?? null,
      rewardQuantity: input.rewardQuantity ?? null,
      isActive: input.isActive ?? true,
    },
  });
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "quantitytieroffer.created",
      entity: "quantityTierOffer",
      entityId: offer.id,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: offer as unknown as Record<string, unknown>,
    },
  );
  return NextResponse.json({ offer }, { status: 201 });
}, "POST /api/storefront/offers");
