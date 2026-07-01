import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAgentStream, type AgentMessage, type AgentStreamEvent, type AgentResult } from "@/lib/ai/chat/agent";
import { isAuthenticated } from "@/lib/auth/server";

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
    include: { messages: { orderBy: { createdAt: "asc" } } },
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
  const history: AgentMessage[] = session.messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

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
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // PERF-001: abort the agent loop when the client disconnects
      const onAbort = () => { try { controller.close(); } catch { /* already closed */ } };
      if (req.signal) { req.signal.addEventListener("abort", onAbort); }
      let assistantResponse = "";
      let assistantToolCalls: AgentResult["toolCalls"] = [];

      function send(event: AgentStreamEvent): void {
        const sse = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(sse));
      }

      try {
        for await (const event of runAgentStream(history, input.message)) {
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
        const message = err instanceof Error ? err.message : "Erreur interne";
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
                ? JSON.stringify(assistantToolCalls)
                : null,
          },
        });
      } catch {
        // If saving fails, the stream still delivered the response — don't crash
      }

      // Signal end of stream
      controller.enqueue(encoder.encode("event: close\ndata: {}\n\n"));
      controller.close();
    },
    cancel() { /* PERF-001: client disconnected — stop the stream */ },
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
