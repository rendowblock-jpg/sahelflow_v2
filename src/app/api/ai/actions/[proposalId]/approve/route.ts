import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  approveAiActionProposal,
} from "@/lib/ai/actions/service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ proposalId: string }> };

const approvalSchema = z
  .object({
    proposalDigest: z.string().regex(/^[0-9a-f]{64}$/i),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

/** Approve and execute one exact persisted AI action proposal. */
export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireAuth("approvals.approve");
    const approver = await requireTrustedActor();
    const { proposalId } = await params;
    const input = approvalSchema.parse(await request.json());
    const result = await approveAiActionProposal({
      context: { prisma: db, shop: shopContext },
      approver,
      proposalId,
      proposalDigest: input.proposalDigest,
      reason: input.reason,
    });
    return NextResponse.json(result);
  },
  "POST /api/ai/actions/[proposalId]/approve",
);
