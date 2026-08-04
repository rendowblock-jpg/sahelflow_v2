import { NextResponse } from "next/server";

import { getAiActionProposal } from "@/lib/ai/actions/service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ proposalId: string }> };

/** Return one sanitized proposal projection and its exact approval digest. */
export const GET = withErrorHandler(
  async (_request: Request, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const actor = await requireTrustedActor();
    const { proposalId } = await params;
    const proposal = await getAiActionProposal(
      { prisma: db, shop: shopContext },
      actor,
      proposalId,
    );
    return NextResponse.json(proposal);
  },
  "GET /api/ai/actions/[proposalId]",
);
