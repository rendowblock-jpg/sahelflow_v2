import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { revokeAgentGrantIdentity } from "@/lib/identity/control-authority";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { revokeMcpAgentGrant } from "@/lib/mcp/grants";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/mcp/grants/[id]/revoke — disconnect an external agent. Revocation
 * is checked on every MCP request, so the agent loses access on its next call.
 * Revoking an already revoked grant is a no-op that returns its current state.
 */
export const POST = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireAuth(["ai.use", "integrations.manage"]);
    const { id } = await params;
    const grant = await revokeMcpAgentGrant(
      db,
      id,
      trustedActorAuditIdentity(actorContext.actor),
      (grantId) => revokeAgentGrantIdentity(grantId, shopContext),
    );
    return NextResponse.json({ grant });
  },
  "POST /api/mcp/grants/[id]/revoke",
);
