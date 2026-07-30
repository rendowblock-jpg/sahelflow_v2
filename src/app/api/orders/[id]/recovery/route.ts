import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import {
  executeCanonicalOrderRecovery,
  getCanonicalOrderRecoveryPosition,
} from "@/lib/orders/canonical-order-recovery";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(
  async (_request, { params }: { params: Promise<{ id: string }> }) => {
    const actorContext = await requireTrustedActor();
    const { id } = await params;
    const position = await getCanonicalOrderRecoveryPosition(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      id,
    );
    return NextResponse.json({ position });
  },
  "GET /api/orders/[id]/recovery",
);

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const actorContext = await requireTrustedActor();
    const { id } = await params;
    const command = await executeCanonicalOrderRecovery(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      { ...(await request.json()), orderId: id },
    );
    return NextResponse.json({
      recovery: command.result,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/recovery",
);
