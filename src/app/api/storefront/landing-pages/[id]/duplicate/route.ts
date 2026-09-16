import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { duplicateLandingPage } from "@/lib/storefront/landing-page-service";

export const dynamic = "force-dynamic";

/**
 * FD-061 EX-4: duplicate a landing page — a fresh draft with a fresh slug
 * and zeroed counters whose image rows share the original immutable upload
 * objects. The sibling-comparison creative-test flow, not a stats clone.
 * Storefront.manage-gated and audit-logged.
 */
export const POST = withErrorHandler(
  async (
    _req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id } = await context.params;

    const page = await duplicateLandingPage(
      { prisma: db, shop: shopContext },
      id,
    );
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "landingpage.duplicated",
        entity: "landingPage",
        entityId: page.id,
        actor: trustedActorAuditIdentity(actorContext.actor),
        after: { ...page, duplicatedFrom: id } as unknown as Record<string, unknown>,
      },
    );
    return NextResponse.json({ page }, { status: 201 });
  },
  "POST /api/storefront/landing-pages/:id/duplicate",
);
