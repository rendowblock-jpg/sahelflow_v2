import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import {
  canonicalCustomerReturnRequestSchema,
  requestCanonicalCustomerReturn,
} from "@/lib/orders/canonical-customer-return";
import { getCanonicalCustomerReturnPosition } from "@/lib/orders/canonical-customer-return-projections";
import {
  projectCustomerReturnPosition,
  projectCustomerReturnResult,
} from "@/lib/identity/return-projection";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("orders.read");
    const { id } = await params;
    const position = await getCanonicalCustomerReturnPosition(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      id,
    );
    return NextResponse.json({
      position: projectCustomerReturnPosition(actorContext, position),
    });
  },
  "GET /api/orders/[id]/customer-return",
);

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("orders.update");
    const { id } = await params;
    const input = canonicalCustomerReturnRequestSchema.parse({
      ...(await request.json()),
      orderId: id,
    });
    if (input.exchangeDeliveryCost > 0) {
      assertTrustedAction(actorContext, "orders.financials.read");
      assertTrustedAction(actorContext, "orders.financials.update");
    }
    const command = await requestCanonicalCustomerReturn(
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
  "POST /api/orders/[id]/customer-return",
);
