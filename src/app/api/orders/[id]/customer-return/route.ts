import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { requestCanonicalCustomerReturn } from "@/lib/orders/canonical-customer-return";
import { getCanonicalCustomerReturnPosition } from "@/lib/orders/canonical-customer-return-projections";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedActor();
    const { id } = await params;
    const position = await getCanonicalCustomerReturnPosition(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      id,
    );
    return NextResponse.json({ position });
  },
  "GET /api/orders/[id]/customer-return",
);

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedActor();
    const { id } = await params;
    const command = await requestCanonicalCustomerReturn(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      { ...(await request.json()), orderId: id },
    );
    return NextResponse.json({
      returnCase: command.result,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/customer-return",
);
