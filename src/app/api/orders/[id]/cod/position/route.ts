import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getCanonicalCodOrderPosition } from "@/lib/accounting/canonical-cod-projections";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(
  async (_request, { params }: { params: Promise<{ id: string }> }) => {
    const actorContext = await requireTrustedActor();
    const { id } = await params;
    const position = await getCanonicalCodOrderPosition(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      id,
    );
    return NextResponse.json({ position });
  },
  "GET /api/orders/[id]/cod/position",
);
