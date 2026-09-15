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
  moderateProductReview,
  type ReviewModerationAction,
} from "@/lib/storefront/review-service";

export const dynamic = "force-dynamic";

const moderateSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

/**
 * FD-061 EX-4: seller moderation of an order-verified review.
 * Dashboard-authenticated (storefront.manage); the transition writes are
 * idempotent and reversible between approved/rejected.
 */
export const POST = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    const { id } = await context.params;
    const input = moderateSchema.parse(await request.json());

    const changed = await moderateProductReview(
      { prisma: db, shop: shopContext },
      { reviewId: id, action: input.action as ReviewModerationAction },
    );

    if (changed > 0) {
      await logAudit(
        { prisma: db, shop: shopContext },
        {
          action: "review.moderated",
          entity: "productReview",
          entityId: id,
          actor: trustedActorAuditIdentity(actorContext.actor),
          after: { status: input.action },
        },
      );
    }
    return NextResponse.json({ ok: true, changed });
  },
  "POST /api/storefront/reviews/:id/moderate",
);
