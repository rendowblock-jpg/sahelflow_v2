import { NextResponse } from "next/server";

import { listAiActionProposals } from "@/lib/ai/actions/service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Return sanitized durable action history for one exact AI session. */
export const GET = withErrorHandler(
  async (_request: Request, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const actor = await requireTrustedActor();
    const { id } = await params;
    const proposals = await listAiActionProposals(
      { prisma: db, shop: shopContext },
      actor,
      id,
    );
    return NextResponse.json({ proposals });
  },
  "GET /api/ai/sessions/[id]/actions",
);
