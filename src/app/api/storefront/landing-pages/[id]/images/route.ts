import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import {
  addLandingPageImage,
  landingPageImageSchema,
} from "@/lib/storefront/landing-page-service";

export const dynamic = "force-dynamic";

/**
 * FD-061 EX-4: landing-page image stack.
 * GET    — the page's images in stack order (storefront.read).
 * POST   — append one image (URL must be a content-addressed immutable
 *          /uploads/ object from POST /api/upload; storefront.manage).
 * Mutations are audit-logged.
 */
export const GET = withErrorHandler(
  async (
    _req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    await requireTrustedAction("storefront.read");
    const { id } = await context.params;
    const images = await db.landingPageImage.findMany({
      where: { landingPageId: id },
      orderBy: { position: "asc" },
    });
    return NextResponse.json({ images });
  },
  "GET /api/storefront/landing-pages/:id/images",
);

export const POST = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id } = await context.params;
    const input = landingPageImageSchema.parse(await req.json());

    await addLandingPageImage(
      { prisma: db, shop: shopContext },
      { ...input, landingPageId: id },
    );
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "landingpage.image_added",
        entity: "landingPage",
        entityId: id,
        actor: trustedActorAuditIdentity(actorContext.actor),
        after: { url: input.url } as unknown as Record<string, unknown>,
      },
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  "POST /api/storefront/landing-pages/:id/images",
);
