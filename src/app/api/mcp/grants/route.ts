import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { bindAgentGrantIdentity } from "@/lib/identity/control-authority";
import {
  trustedActionAllowed,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { buildMcpGrantCatalog } from "@/lib/mcp/control-surface";
import { mcpBridgePath } from "@/lib/mcp/endpoint";
import {
  createMcpAgentGrant,
  listMcpAgentGrants,
  normalizeGrantRequest,
} from "@/lib/mcp/grants";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

function isOwner(context: TrustedActorContext): boolean {
  return context.actor.kind === "person" && context.actor.role === "owner";
}

/**
 * GET /api/mcp/grants — the connected-agent list plus the tools the viewer may
 * grant (MCP-12). Grant secrets are never returned here; only a 4-character
 * hint identifies one.
 */
export const GET = withErrorHandler(async () => {
  const actorContext = await requireAuth(["ai.use", "integrations.read"]);
  const [grants, catalog] = await Promise.all([
    listMcpAgentGrants(db),
    buildMcpGrantCatalog(actorContext),
  ]);
  const canManage =
    isOwner(actorContext) &&
    trustedActionAllowed(actorContext, "integrations.manage", {
      shopId: actorContext.shop.shopId,
    });
  // The installed bridge path lets the Connect dialog offer a ready-to-paste
  // client configuration; it is absent outside the packaged app.
  return NextResponse.json({ grants, catalog, canManage, bridgePath: mcpBridgePath() });
}, "GET /api/mcp/grants");

/**
 * POST /api/mcp/grants — connect a new external agent. The response carries the
 * grant secret exactly once; it is stored only as a hash. A grant can only name
 * tools the creating owner is authorized to use, and it acts under its own
 * durable identity binding copied from the owner's (MCP-11).
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireAuth(["ai.use", "integrations.manage"]);
  const actor = actorContext.actor;
  if (actor.kind !== "person" || actor.role !== "owner") {
    // Agent identity is bound from the owner's durable binding (MCP-11).
    throw new SahelFlowError(
      "Only the shop owner can connect an agent",
      "MCP_GRANT_OWNER_ONLY",
      403,
    );
  }
  const body = await request.json().catch(() => ({}));
  const catalog = await buildMcpGrantCatalog(actorContext);
  const input = normalizeGrantRequest(
    body && typeof body === "object" ? body : {},
    new Set(catalog.map((entry) => entry.name)),
  );
  const created = await createMcpAgentGrant(db, {
    ...input,
    createdBy: trustedActorAuditIdentity(actor),
    bindIdentity: (grantId) => bindAgentGrantIdentity(actor.sessionId, grantId, shopContext),
  });
  return NextResponse.json(created, {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
}, "POST /api/mcp/grants");
