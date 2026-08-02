import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { submitCanonicalSourceDraft } from "@/lib/orders/canonical-source-draft";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const actorContext = await requireTrustedAction("orders.create");
    const { id } = await params;
    const command = await submitCanonicalSourceDraft(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      { ...(await request.json()), orderId: id },
    );
    return NextResponse.json({
      submission: command.result,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/source/submit",
);
