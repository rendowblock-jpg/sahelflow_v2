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
  transitionLandingPage,
  type LandingPageTransitionAction,
} from "@/lib/storefront/landing-page-service";

export const dynamic = "force-dynamic";

const transitionSchema = z.object({
  action: z.enum(["publish", "unpublish", "archive"]),
});

/**
 * FD-061 EX-4: landing-page lifecycle — publish (stamped, public at
 * /storefront/<slug>/lp/<page>), unpublish (back to draft), archive.
 * Storefront.manage-gated and audit-logged.
 */
export const POST = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id } = await context.params;
    const input = transitionSchema.parse(await req.json());

    const page = await transitionLandingPage(
      { prisma: db, shop: shopContext },
      id,
      input.action as LandingPageTransitionAction,
    );
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: `landingpage.${input.action}`,
        entity: "landingPage",
        entityId: page.id,
        actor: trustedActorAuditIdentity(actorContext.actor),
        after: page as unknown as Record<string, unknown>,
      },
    );
    return NextResponse.json({ page });
  },
  "POST /api/storefront/landing-pages/:id/transition",
);
