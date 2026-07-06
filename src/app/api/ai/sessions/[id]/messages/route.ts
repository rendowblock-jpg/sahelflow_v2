import { NextRequest, NextResponse } from "next/server";
import { requireLicense } from "@/lib/license/license-service";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAgent, type AgentMessage } from "@/lib/ai/chat/agent";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { redactPii } from "@/lib/redact-pii";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/ai/sessions/[id]/messages — list messages in a session. */
export const GET = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const session = await db.aiChatSession.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } }, // AI-H3: cap history
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ session });
}, "GET /api/ai/sessions/[id]/messages");

const sendSchema = z.object({
  message: z.string().min(1).max(4000),
});

/** POST /api/ai/sessions/[id]/messages — send a message + get AI response. */
export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  // Session 30 (AUDIT-7 AI5): license gate on message send (not just session create)
  await requireLicense();
  const { id } = await params;

  // AI-H1: rate limit (parity with the streaming route). Without this, users
  // could bypass rate limiting by using the non-streaming endpoint —
  // exhausting the Gemini free-tier quota (15 RPD) in seconds.
  const rl = checkRateLimit(id);
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.reason ?? "Rate limited" }, { status: 429 });
  }
  const body = await req.json();
  const input = sendSchema.parse(body);

  const session = await db.aiChatSession.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } }, // AI-H3: cap history
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Save the user message
  await db.aiChatMessage.create({
    data: { sessionId: id, role: "user", content: input.message },
  });

  // Build the conversation history for the agent
  const history: AgentMessage[] = session.messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  // Run the agent
  const result = await runAgent(history, input.message);

  // Save the assistant response (with tool calls as metadata)
  await db.aiChatMessage.create({
    data: {
      sessionId: id,
      role: "assistant",
      content: result.response || "(erreur)",
      // Session 30 (AUDIT-7 AI3): redact PII before persisting tool calls.
      // Tool results can contain customer phone, address, notes — these would
      // be stored in plaintext, defeating the PII-encryption architecture.
      toolCalls: result.toolCalls.length > 0
        ? JSON.stringify(redactPii(result.toolCalls))
        : null,
    },
  });

  // Update session timestamp + auto-title from first message
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

  return NextResponse.json({
    response: result.response,
    toolCalls: result.toolCalls,
    error: result.error,
  });
}, "POST /api/ai/sessions/[id]/messages");
