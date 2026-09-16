import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { offerSchema } from "@/lib/storefront/quantity-tier-service";

export const dynamic = "force-dynamic";

const updateSchema = offerSchema.partial();

/**
 * FD-061 EX-4: seller mutation of one quantity-tier offer.
 * PATCH — partial update; DELETE — remove. Both storefront.manage-gated
 * and audit-logged.
 */
export const PATCH = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id } = await context.params;
    const input = updateSchema.parse(await req.json());

    const offer = await db.quantityTierOffer.update({
      where: { id },
      data: {
        ...(input.storefrontSlug !== undefined
          ? { storefrontSlug: input.storefrontSlug }
          : {}),
        ...(input.triggerProductId !== undefined
          ? { triggerProductId: input.triggerProductId }
          : {}),
        ...(input.triggerVariantId !== undefined
          ? { triggerVariantId: input.triggerVariantId ?? null }
          : {}),
        ...(input.triggerQuantity !== undefined
          ? { triggerQuantity: input.triggerQuantity }
          : {}),
        ...(input.rewardType !== undefined ? { rewardType: input.rewardType } : {}),
        ...(input.rewardProductId !== undefined
          ? { rewardProductId: input.rewardProductId ?? null }
          : {}),
        ...(input.rewardVariantId !== undefined
          ? { rewardVariantId: input.rewardVariantId ?? null }
          : {}),
        ...(input.rewardQuantity !== undefined
          ? { rewardQuantity: input.rewardQuantity ?? null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "quantitytieroffer.updated",
        entity: "quantityTierOffer",
        entityId: offer.id,
        actor: trustedActorAuditIdentity(actorContext.actor),
        after: offer as unknown as Record<string, unknown>,
      },
    );
    return NextResponse.json({ offer });
  },
  "PATCH /api/storefront/offers/:id",
);

export const DELETE = withErrorHandler(
  async (
    _req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id } = await context.params;

    const offer = await db.quantityTierOffer.delete({ where: { id } });
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "quantitytieroffer.deleted",
        entity: "quantityTierOffer",
        entityId: id,
        actor: trustedActorAuditIdentity(actorContext.actor),
        before: offer as unknown as Record<string, unknown>,
      },
    );
    return NextResponse.json({ ok: true });
  },
  "DELETE /api/storefront/offers/:id",
);
