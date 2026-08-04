import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { listAutomationRunHistory } from "@/lib/automations/recovery";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAuth("automations.read");
  const input = querySchema.parse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const runs = await listAutomationRunHistory(
    { prisma: db, shop: shopContext },
    input.limit,
  );
  return NextResponse.json(
    { runs },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/automations/runs");
