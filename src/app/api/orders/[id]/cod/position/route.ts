import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getCanonicalCodOrderPosition } from "@/lib/accounting/canonical-cod-projections";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(
  async (_request, { params }: { params: Promise<{ id: string }> }) => {
    const actorContext = await requireTrustedAction("orders.read");
    assertTrustedAction(actorContext, "orders.financials.read");
    const { id } = await params;
    const position = await getCanonicalCodOrderPosition(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      id,
    );
    // The COD workspace and the customers API show a name only with
    // customers.contact.read; a custom allowlist can hold financials without it.
    const canReadName = trustedActionAllowed(
      actorContext,
      "customers.contact.read",
      { shopId: actorContext.shop.shopId },
    );
    return NextResponse.json({
      position: canReadName ? position : { ...position, customerName: null },
    });
  },
  "GET /api/orders/[id]/cod/position",
);
