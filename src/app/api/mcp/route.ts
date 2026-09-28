/**
 * Local MCP endpoint (FD-063).
 *
 * `POST /api/mcp` — stateless Streamable HTTP, loopback only, bearer-token
 * gated. Every session opens under an active MCP-12 agent grant
 * (`x-sahelflow-agent-grant`) whose own durable identity binding (MCP-11) is
 * re-read on each request: a revoked grant, owner or device, or a policy
 * change, cuts the agent off on its very next call. No grant, no tools —
 * fail-closed, exactly like CodFlow's unauthenticated registration.
 *
 * This route carries no approval path. Approval lives in the Agents workspace
 * under `approvals.approve`, which the MCP surface may never require.
 */
import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { trustedActorForAgentGrant } from "@/lib/identity/trusted-actor";
import { normalizeMcpClient, openMcpAgentSession } from "@/lib/mcp/agent-session";
import { resolveMcpAgentGrant } from "@/lib/mcp/grants";
import {
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_PARSE_ERROR,
  handleMcpRequest,
  jsonRpcError,
  type JsonRpcResponse,
} from "@/lib/mcp/protocol";
import { authorizeMcpTransport } from "@/lib/mcp/transport-auth";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

// The shared API boundary applies the installation license lockout and shop
// authority before any agent traffic is served; JSON-RPC shapes are produced
// inside the handler, so only unexpected failures reach the wrapper.
export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  try {
    await authorizeMcpTransport(request);
  } catch (error) {
    const code = error instanceof SahelFlowError ? error.code : "UNAUTHORIZED";
    return NextResponse.json({ error: "Unauthorized", code }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      jsonRpcError(null, JSON_RPC_INVALID_REQUEST, "Request body is too large"),
      { status: 413 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      jsonRpcError(null, JSON_RPC_PARSE_ERROR, "Parse error"),
      { status: 400 },
    );
  }

  let session;
  try {
    const clientInfo = extractClientInfo(payload);
    const grant = await resolveMcpAgentGrant(
      db,
      request.headers.get("x-sahelflow-agent-grant"),
      normalizeMcpClient(clientInfo),
    );
    // The grant's own durable identity binding is the agent's authority; no
    // browser session is borrowed (MCP-11).
    const actorContext = await trustedActorForAgentGrant(grant.id, shopContext);
    assertTrustedAction(actorContext, "ai.use", { shopId: shopContext.shopId });
    session = openMcpAgentSession({ actorContext, client: clientInfo, grant });
  } catch (error) {
    const status = error instanceof SahelFlowError ? error.statusCode : 401;
    const code = error instanceof SahelFlowError ? error.code : "UNAUTHORIZED";
    if (status >= 500) {
      return NextResponse.json({ error: "Unavailable", code }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Unauthorized", code },
      { status: status === 403 ? 403 : 401 },
    );
  }

  // A JSON-RPC batch is answered as a batch; notifications produce no entry.
  if (Array.isArray(payload)) {
    const responses: JsonRpcResponse[] = [];
    for (const entry of payload.slice(0, 32)) {
      const response = await handleMcpRequest(session, entry);
      if (response) responses.push(response);
    }
    if (responses.length === 0) return new NextResponse(null, { status: 202 });
    return NextResponse.json(responses);
  }

  const response = await handleMcpRequest(session, payload);
  if (!response) return new NextResponse(null, { status: 202 });
  return NextResponse.json(response);
}, "POST /api/mcp");

function extractClientInfo(
  payload: unknown,
): { name?: unknown; version?: unknown } | undefined {
  const message = Array.isArray(payload) ? payload[0] : payload;
  if (!message || typeof message !== "object") return undefined;
  const params = (message as Record<string, unknown>).params;
  if (!params || typeof params !== "object") return undefined;
  const clientInfo = (params as Record<string, unknown>).clientInfo;
  if (!clientInfo || typeof clientInfo !== "object") return undefined;
  return clientInfo as { name?: unknown; version?: unknown };
}
