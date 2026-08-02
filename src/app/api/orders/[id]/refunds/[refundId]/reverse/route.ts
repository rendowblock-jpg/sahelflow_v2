import { NextRequest, NextResponse } from "next/server";

import { reverseCanonicalRefund } from "@/lib/accounting/canonical-refund";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; refundId: string }>;
};

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("orders.update");
    assertTrustedAction(actorContext, "orders.financials.read");
    assertTrustedAction(actorContext, "orders.financials.update");
    const { id, refundId } = await params;
    const command = await reverseCanonicalRefund(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      { ...(await request.json()), orderId: id, refundId },
    );
    return NextResponse.json({
      refund: command.result,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/refunds/[refundId]/reverse",
);
