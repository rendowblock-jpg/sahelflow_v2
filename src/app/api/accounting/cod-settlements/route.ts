import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { postCanonicalCodSettlement } from "@/lib/accounting/canonical-cod";
import { getCanonicalCodWorkspaceSummary } from "@/lib/accounting/canonical-cod-projections";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const actorContext = await requireTrustedActor();
  const summary = await getCanonicalCodWorkspaceSummary({
    prisma: db,
    shop: actorContext.shop,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  });
  return NextResponse.json({ summary });
}, "GET /api/accounting/cod-settlements");

export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedActor();
  const command = await postCanonicalCodSettlement(
    {
      prisma: db,
      shop: actorContext.shop,
      businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
    },
    await request.json(),
  );
  return NextResponse.json({
    settlement: command.result,
    command: {
      id: command.commandId,
      aggregateVersion: command.aggregateVersion,
      replayed: command.replayed,
    },
  });
}, "POST /api/accounting/cod-settlements");
