/**
 * Agent chat API — SSE streaming endpoint for the MCP-native agent.
 *
 * POST /api/agents/chat
 * Body: { message: string, sessionId?: string, locale?: "en"|"fr"|"ar" }
 *
 * Streams AgentStreamEvents as SSE:
 * - tool_call_start / tool_call_end
 * - text_delta
 * - proposal
 * - turn_signal
 * - done / error
 */

import { NextRequest, NextResponse } from "next/server";

import { runAgentTurn } from "@/lib/agents/orchestrator";
import type { McpToolContext } from "@/lib/mcp/types";
import { db, shopContext } from "@/lib/db";
import { requireAuth } from "@/lib/auth/server";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { message, sessionId, locale = "en" } = body as {
      message: string;
      sessionId?: string;
      locale?: "en" | "fr" | "ar";
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Build tool context
    const ctx: McpToolContext = {
      db,
      shop: { shopId: shopContext.shopId, shopName: shopContext.shopName },
      actor: {
        memberId: auth.memberId,
        memberName: auth.memberName,
        role: auth.role,
        permissions: auth.permissions,
      },
      sessionId,
    };

    // Load conversation history (simplified — in production, load from DB)
    const history: Array<{
      role: "user" | "model";
      parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }>;
    }> = [];

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          for await (const event of runAgentTurn(
            message.trim(),
            history,
            ctx,
            undefined,
            locale,
          )) {
            send(event as unknown as Record<string, unknown>);
          }
        } catch (error) {
          logger.error("Agent turn error", { error });
          send({
            type: "error",
            error: error instanceof Error ? error.message : "Internal error",
            code: "AI_INTERNAL_ERROR",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("Agent API error", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
