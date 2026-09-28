import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { listMcpInvocations } from "@/lib/mcp/control-surface";

export const dynamic = "force-dynamic";

/**
 * GET /api/mcp/invocations — what connected agents recently did (MCP-13).
 * Reads the `mcp.tool_called.v1` audit rows; call arguments are never
 * returned, only outcome, timing and any proposal a sensitive call produced.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth(["ai.use", "integrations.read"]);
  const invocations = await listMcpInvocations(db);
  return NextResponse.json({ invocations });
}, "GET /api/mcp/invocations");
