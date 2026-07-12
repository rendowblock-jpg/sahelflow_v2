import { NextRequest, NextResponse } from "next/server";
import { requireLicense } from "@/lib/license/license-server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAgent, type AgentMessage } from "@/lib/ai/chat/agent";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { redactPii } from "@/lib/redact-pii";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, getCurrentUserKey } from "@/lib/auth/server";
import { getBool, SETTING_KEYS } from "@/lib/settings";

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

  // fix-B6: Informed-consent gate. The AI chat assistant forwards the
  // seller's question + conversation history (which may reference customer
  // PII via tool results) to Google Gemini. Without explicit consent,
  // refuse the request — same gate as /api/extraction.
  const consent = await getBool(SETTING_KEYS.geminiConsentAccepted, false);
  if (!consent) {
    return NextResponse.json(
      {
        error: "consent_required",
        message:
          "AI assistant consent not given. Visit Settings → AI to enable.",
      },
      { status: 403 },
    );
  }

  // Session 30 (AUDIT-7 AI5): license gate on message send (not just session create)
  await requireLicense();
  const { id } = await params;

  // AI-H1: rate limit (parity with the streaming route). Without this, users
  // could bypass rate limiting by using the non-streaming endpoint —
  // exhausting the Gemini free-tier quota (15 RPD) in seconds.
  // AI-P1: pass the auth session id as userKey so the daily cap is
  // enforced across all of the user's AI chat sessions (previously
  // every session shared a single "default" user bucket).
  const userKey = await getCurrentUserKey();
  const rl = checkRateLimit(id, userKey);
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
    // W2-3: forward the pending-confirmation signal so the UI can show a
    // confirm dialog. The next user message — if it contains "oui" /
    // "yes" / "نعم" / "ok" — will re-enter runAgent and execute the tool.
    pendingConfirmation: result.pendingConfirmation,
  });
}, "POST /api/ai/sessions/[id]/messages");
