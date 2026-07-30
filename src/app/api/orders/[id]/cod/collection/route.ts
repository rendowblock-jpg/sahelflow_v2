import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { recordCanonicalCodCollection } from "@/lib/accounting/canonical-cod";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const actorContext = await requireTrustedActor();
    const { id } = await params;
    const command = await recordCanonicalCodCollection(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      { ...(await request.json()), orderId: id },
    );

    return NextResponse.json({
      collection: command.result,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/cod/collection",
);
