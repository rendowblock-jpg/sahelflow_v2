import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import {
  deleteLandingPage,
  landingPageUpdateSchema,
  updateLandingPage,
} from "@/lib/storefront/landing-page-service";

export const dynamic = "force-dynamic";

// Composed from the refinement-free base: `.partial()` cannot be used on
// object schemas containing refinements (a Next build page-data
// collection failure, not a type error).
const updateSchema = landingPageUpdateSchema;

/**
 * FD-061 EX-4: seller mutation of one landing page.
 * PATCH — partial update (name/slug/spacing/meta; the product and
 *         storefront are fixed for life).
 * DELETE — remove, guarded: a page with attributed orders cannot be
 *          deleted (archive it instead so history stays intact).
 * Both storefront.manage-gated and audit-logged.
 */
export const PATCH = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id } = await context.params;
    const input = updateSchema.parse(await req.json());

    const page = await updateLandingPage(
      { prisma: db, shop: shopContext },
      id,
      input,
    );
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "landingpage.updated",
        entity: "landingPage",
        entityId: page.id,
        actor: trustedActorAuditIdentity(actorContext.actor),
        after: page as unknown as Record<string, unknown>,
      },
    );
    return NextResponse.json({ page });
  },
  "PATCH /api/storefront/landing-pages/:id",
);

export const DELETE = withErrorHandler(
  async (
    _req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id } = await context.params;

    await deleteLandingPage({ prisma: db, shop: shopContext }, id);
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "landingpage.deleted",
        entity: "landingPage",
        entityId: id,
        actor: trustedActorAuditIdentity(actorContext.actor),
      },
    );
    return NextResponse.json({ ok: true });
  },
  "DELETE /api/storefront/landing-pages/:id",
);
