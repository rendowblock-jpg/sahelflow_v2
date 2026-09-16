import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import {
  reorderLandingPageImages,
  reorderLandingPageImagesSchema,
} from "@/lib/storefront/landing-page-service";

export const dynamic = "force-dynamic";

/**
 * FD-061 EX-4: reorder a landing page's image stack. The checked contract:
 * the id list must be duplicate-free and cover EXACTLY the page's current
 * images. Storefront.manage-gated and audit-logged.
 */
export const PUT = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id } = await context.params;
    const body = reorderLandingPageImagesSchema.parse(await req.json());

    await reorderLandingPageImages({ prisma: db, shop: shopContext }, {
      landingPageId: id,
      imageIds: body.imageIds,
    });
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "landingpage.images_reordered",
        entity: "landingPage",
        entityId: id,
        actor: trustedActorAuditIdentity(actorContext.actor),
        after: { order: body.imageIds } as unknown as Record<string, unknown>,
      },
    );
    return NextResponse.json({ ok: true });
  },
  "PUT /api/storefront/landing-pages/:id/images/reorder",
);
