/**
 * Local MCP endpoint (FD-063).
 *
 * `POST /api/mcp` — stateless Streamable HTTP, loopback only, bearer-token
 * gated, and bound to the durable Founder session the sidecar forwards. Without
 * a real person session there is no agent session and therefore zero tools:
 * fail-closed, exactly like CodFlow's unauthenticated registration.
 *
 * This route carries no approval path. Approval lives in the Agents workspace
 * under `approvals.approve`, which the MCP surface may never require.
 */
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/server";
import { openMcpAgentSession } from "@/lib/mcp/agent-session";
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

export async function POST(request: Request): Promise<NextResponse> {
  let connectionId: string;
  try {
    ({ connectionId } = await authorizeMcpTransport(request));
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
    const actorContext = await requireAuth("ai.use");
    session = openMcpAgentSession({
      actorContext,
      client: extractClientInfo(payload),
      connectionId,
    });
  } catch (error) {
    const status = error instanceof SahelFlowError ? error.status : 401;
    const code = error instanceof SahelFlowError ? error.code : "UNAUTHORIZED";
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
}

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
