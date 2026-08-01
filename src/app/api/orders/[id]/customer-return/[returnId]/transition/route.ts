import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import {
  canonicalCustomerReturnTransitionSchema,
  transitionCanonicalCustomerReturn,
} from "@/lib/orders/canonical-customer-return";
import { projectCustomerReturnResult } from "@/lib/identity/return-projection";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; returnId: string }>;
};

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("orders.update");
    const { id, returnId } = await params;
    const input = canonicalCustomerReturnTransitionSchema.parse({
      ...(await request.json()),
      orderId: id,
      returnId,
    });
    if (input.action === "inspect") {
      assertTrustedAction(actorContext, "orders.financials.read");
      assertTrustedAction(actorContext, "orders.financials.update");
    }
    const command = await transitionCanonicalCustomerReturn(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      input,
    );
    return NextResponse.json({
      returnCase: projectCustomerReturnResult(actorContext, command.result),
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/customer-return/[returnId]/transition",
);
