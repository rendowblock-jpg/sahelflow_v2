import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import {
  trustedActionAllowed,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { buildMcpGrantCatalog } from "@/lib/mcp/control-surface";
import {
  createMcpAgentGrant,
  listMcpAgentGrants,
  normalizeGrantRequest,
} from "@/lib/mcp/grants";

export const dynamic = "force-dynamic";

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
  const canManage = trustedActionAllowed(actorContext, "integrations.manage", {
    shopId: actorContext.shop.shopId,
  });
  return NextResponse.json({ grants, catalog, canManage });
}, "GET /api/mcp/grants");

/**
 * POST /api/mcp/grants — connect a new external agent. The response carries the
 * grant secret exactly once; it is stored only as a hash. A grant can only name
 * tools the creating person is authorized to use.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireAuth(["ai.use", "integrations.manage"]);
  const body = await request.json().catch(() => ({}));
  const catalog = await buildMcpGrantCatalog(actorContext);
  const input = normalizeGrantRequest(
    body && typeof body === "object" ? body : {},
    new Set(catalog.map((entry) => entry.name)),
  );
  const created = await createMcpAgentGrant(db, {
    ...input,
    createdBy: trustedActorAuditIdentity(actorContext.actor),
  });
  return NextResponse.json(created, {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
}, "POST /api/mcp/grants");
