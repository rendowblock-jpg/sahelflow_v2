import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { transitionCanonicalCustomerReturn } from "@/lib/orders/canonical-customer-return";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; returnId: string }>;
};

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedActor();
    const { id, returnId } = await params;
    const command = await transitionCanonicalCustomerReturn(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      { ...(await request.json()), orderId: id, returnId },
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
  "POST /api/orders/[id]/customer-return/[returnId]/transition",
);
