import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { deleteLandingPageImage } from "@/lib/storefront/landing-page-service";

export const dynamic = "force-dynamic";

/**
 * FD-061 EX-4: remove one image from a landing page's stack.
 * Reference-counted: the underlying immutable upload file is unlinked only
 * at its last landing-page reference (and never while a product or
 * storefront theme still references it), storage-first — a failed unlink
 * aborts before the row is removed. Storefront.manage-gated and
 * audit-logged.
 */
export const DELETE = withErrorHandler(
  async (
    _req: NextRequest,
    context: { params: Promise<{ id: string; imageId: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id, imageId } = await context.params;

    await deleteLandingPageImage(
      { prisma: db, shop: shopContext },
      id,
      imageId,
    );
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "landingpage.image_deleted",
        entity: "landingPage",
        entityId: id,
        actor: trustedActorAuditIdentity(actorContext.actor),
        before: { imageId } as unknown as Record<string, unknown>,
      },
    );
    return NextResponse.json({ ok: true });
  },
  "DELETE /api/storefront/landing-pages/:id/images/:imageId",
);
