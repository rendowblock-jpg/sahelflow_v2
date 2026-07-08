import { NextRequest } from "next/server";
import { requireLicense } from "@/lib/license/license-server";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAgentStream, type AgentMessage, type AgentStreamEvent, type AgentResult } from "@/lib/ai/chat/agent";
import { isAuthenticated, getCurrentUserKey } from "@/lib/auth/server";
import { redactPii } from "@/lib/redact-pii";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  message: z.string().min(1).max(4000),
});

/**
 * POST /api/ai/sessions/[id]/messages/stream
 *
 * Streaming version of the AI chat. Returns a Server-Sent Events (SSE) stream
 * of agent events:
 *
 *   event: tool_call
 *   data: {"name":"search_products","args":{"query":"phone"}}
 *
 *   event: tool_result
 *   data: {"name":"search_products","result":[...]}
 *
 *   event: text_delta
 *   data: {"text":"Voici les produits..."}
 *
 *   event: done
 *   data: {"response":"...","toolCalls":[...]}
 *
 *   event: error
 *   data: {"message":"..."}
 *
 * The user message is saved immediately. The assistant message is saved when
 * the stream completes (on `done` or `error`).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // SEC-013: defense-in-depth auth check (middleware is the primary layer)
  if (!(await isAuthenticated())) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Session 30 (AUDIT-7 AI5): license gate on message stream (not just session create)
  try {
    await requireLicense();
  } catch {
    return new Response(JSON.stringify({ error: "License required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Session 30 (AUDIT-7 AI4): rate limit. AI-P1: pass the auth session id
  // as userKey so the daily cap is per-user, not shared across all sessions
  // via the "default" bucket.
  const userKey = await getCurrentUserKey();
  const rl = checkRateLimit(id, userKey);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: rl.reason ?? "Rate limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let input: z.infer<typeof sendSchema>;
  try {
    const body = await req.json();
    input = sendSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: err.issues }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = await db.aiChatSession.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } }, // AI-H3: cap history
  });

  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Save the user message immediately
  await db.aiChatMessage.create({
    data: { sessionId: id, role: "user", content: input.message },
  });

  // Build conversation history (excluding the just-saved user message, which
  // runAgentStream takes as a separate arg)
  // AI-M15: include prior toolCalls in the conversation history so the
  // agent retains tool context across turns. Previously only m.content
  // (text) was passed back to Gemini — if the AI created an order in
  // turn 1 and the user said "annule-la" in turn 2, Gemini had no record
  // of what "la" referred to (the create_order tool call + result were
  // dropped). Parse the stored JSON toolCalls (already redacted on save)
  // and forward them as part of the AgentMessage.
  const history: AgentMessage[] = session.messages.map((m) => {
    let toolCalls: AgentMessage["toolCalls"];
    if (m.role === "assistant" && m.toolCalls) {
      try {
        const parsed = JSON.parse(m.toolCalls);
        if (Array.isArray(parsed)) {
          toolCalls = parsed as AgentMessage["toolCalls"];
        }
      } catch {
        // Malformed JSON in DB — ignore (older rows may have invalid JSON).
      }
    }
    return {
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    };
  });

  // Auto-title from first message
  if (session.messages.length === 0 && session.title === "Nouvelle conversation") {
    await db.aiChatSession.update({
      where: { id },
      data: { title: input.message.slice(0, 50) },
    });
  } else {
    await db.aiChatSession.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }

  // Build the SSE stream
  const encoder = new TextEncoder();
  // AI-P5: hoist agentAbort + onAbort into the POST function scope so both
  // start() and cancel() can reference them. Previously they were declared
  // inside start() with const, which made cancel()'s references to them
  // fail TypeScript's scope check (TS2552/TS2304).
  let agentAbort = new AbortController();
  let onAbort: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // AI-H2: abort the agent loop (not just the stream) when the client
      // disconnects. Previously onAbort only closed the controller — the
      // agent continued running for up to 5 iterations × 30s = 150s,
      // consuming Gemini quota on a response the user will never see.
      agentAbort = new AbortController();
      onAbort = () => {
        agentAbort.abort();
        try { controller.close(); } catch { /* already closed */ }
      };
      if (req.signal && onAbort) { req.signal.addEventListener("abort", onAbort); }
      let assistantResponse = "";
      let assistantToolCalls: AgentResult["toolCalls"] = [];

      function send(event: AgentStreamEvent): void {
        const sse = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(sse));
      }

      try {
        for await (const event of runAgentStream(history, input.message, agentAbort.signal)) {
          send(event);

          if (event.type === "text_delta") {
            assistantResponse += event.text;
          } else if (event.type === "done") {
            assistantResponse = event.response;
            assistantToolCalls = event.toolCalls;
          } else if (event.type === "error") {
            assistantResponse = event.message;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Internal error";
        send({ type: "error", message });
        assistantResponse = message;
      }

      // Save the assistant message (whether success or error)
      try {
        await db.aiChatMessage.create({
          data: {
            sessionId: id,
            role: "assistant",
            content: assistantResponse || "(erreur)",
            toolCalls:
              assistantToolCalls.length > 0
                ? JSON.stringify(redactPii(assistantToolCalls))
                : null,
          },
        });
      } catch {
        // If saving fails, the stream still delivered the response — don't crash
      }

      // Signal end of stream
      controller.enqueue(encoder.encode("event: close\ndata: {}\n\n"));
      controller.close();
      // AI-P5: remove the abort listener so the (per-request) AbortSignal
      // does not keep the closure alive after the stream ends. Without
      // this, each completed request leaves a dangling listener — minor
      // memory leak in long-running Node processes.
      if (req.signal && onAbort) { req.signal.removeEventListener("abort", onAbort); }
    },
    cancel() {
      /* PERF-001: client disconnected — stop the stream */
      // AI-P5: also remove the listener on the cancel path.
      if (req.signal && onAbort) { req.signal.removeEventListener("abort", onAbort); }
      agentAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable proxy buffering (Caddy, nginx)
    },
  });
}
