import { NextRequest, NextResponse } from "next/server";

import { rejectAiActionProposal } from "@/lib/ai/actions/service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ proposalId: string }> };

/**
 * Operator-deny one pending AI action proposal (ledger AI-03). Terminal and
 * non-executable; the approval path remains the only route to execution.
 */
export const POST = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    await requireAuth("approvals.approve");
    const { proposalId } = await params;
    const result = await rejectAiActionProposal({
      context: { prisma: db, shop: shopContext },
      proposalId,
    });
    return NextResponse.json(result);
  },
  "POST /api/ai/actions/[proposalId]/reject",
);
