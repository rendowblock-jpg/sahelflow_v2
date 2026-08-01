import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { correctCanonicalCodSettlementLine } from "@/lib/accounting/canonical-cod";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ lineId: string }> },
  ) => {
    const actorContext = await requireTrustedActor();
    assertTrustedAction(actorContext, "accounting.update");
    assertTrustedAction(actorContext, "approvals.approve");
    const { lineId } = await params;
    const command = await correctCanonicalCodSettlementLine(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      { ...(await request.json()), settlementLineId: lineId },
    );
    return NextResponse.json({
      correction: command.result,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/accounting/cod-settlements/lines/[lineId]/correction",
);
