import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { retryAutomationRun } from "@/lib/automations/recovery";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

const recoverySchema = z.object({
  runId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("automations.manage");
  const input = recoverySchema.parse(await request.json());
  const result = await retryAutomationRun(
    { prisma: db, shop: shopContext },
    {
      runId: input.runId,
      reason: input.reason,
      auditActor: businessPrincipalFromTrustedActor(actorContext).auditActor,
    },
  );
  return NextResponse.json(
    { result },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}, "POST /api/automations/runs/recovery");
