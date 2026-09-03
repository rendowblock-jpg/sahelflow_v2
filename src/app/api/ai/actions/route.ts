import { NextResponse } from "next/server";

import {
  listPendingAiActionProposalsAcrossSessions,
  listRecentAiActionDecisions,
} from "@/lib/ai/actions/service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/actions — shop-wide proposal inbox (ledger AI-19/AI-20):
 * `pending` carries every still-approvable proposal across sessions with its
 * originating session identity; `recent` carries the last approve/deny/
 * execution outcomes as an audit timeline. No audit-log API exists today, so
 * the timeline is derived only from real proposal rows — nothing fabricated.
 */
export const GET = withErrorHandler(
  async () => {
    await requireAuth("ai.use");
    const actor = await requireTrustedActor();
    const context = { prisma: db, shop: shopContext };
    const [pending, recent] = await Promise.all([
      listPendingAiActionProposalsAcrossSessions(context, actor),
      listRecentAiActionDecisions(context, actor),
    ]);
    return NextResponse.json({ pending, recent });
  },
  "GET /api/ai/actions",
);
