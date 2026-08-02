import { NextRequest, NextResponse } from "next/server";
import { requireLicense } from "@/lib/license/license-server";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import {
  runAgentStream,
  type AgentMessage,
  type AgentStreamEvent,
  type AgentResult,
} from "@/lib/ai/chat/agent";
import {
  resolveAiSourceProposalContext,
  runWithAiSourceProposal,
} from "@/lib/ai/chat/source-proposal";
import { getCurrentUserKey, requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { redactPii } from "@/lib/redact-pii";
import { getBool, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  message: z.string().min(1).max(4000),
});

export const POST = withErrorHandler(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const context = { prisma: db, shop: shopContext };

  await requireAuth("ai.use");

  const consent = await getBool(
    context,
    SETTING_KEYS.geminiConsentAccepted,
    false,
  );
  if (!consent) {
    return new NextResponse(
      JSON.stringify({
        error: "consent_required",
        message:
          "AI assistant consent not given. Visit Settings → AI to enable.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    await requireLicense();
  } catch {
    return new NextResponse(JSON.stringify({ error: "License required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userKey = await getCurrentUserKey();
  const rateLimit = checkRateLimit(id, userKey);
  if (!rateLimit.allowed) {
    return new NextResponse(
      JSON.stringify({ error: rateLimit.reason ?? "Rate limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  let input: z.infer<typeof sendSchema>;
  try {
    input = sendSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(
        JSON.stringify({ error: "Validation failed", details: error.issues }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    return new NextResponse(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = await db.aiChatSession.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
  });
  if (!session) {
    return new NextResponse(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userMessage = await context.prisma.aiChatMessage.create({
    data: { sessionId: id, role: "user", content: input.message },
  });

  const history: AgentMessage[] = session.messages.map((message) => {
    let toolCalls: AgentMessage["toolCalls"];
    if (message.role === "assistant" && message.toolCalls) {
      try {
        const parsed = JSON.parse(message.toolCalls);
        if (Array.isArray(parsed)) {
          toolCalls = parsed as AgentMessage["toolCalls"];
        }
      } catch {
        // Older malformed rows remain readable as plain assistant text.
      }
    }
    return {
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    };
  });
  const proposal = resolveAiSourceProposalContext(
    id,
    session.messages,
    userMessage.id,
  );

  if (
    session.messages.length === 0 &&
    session.title === "Nouvelle conversation"
  ) {
    await context.prisma.aiChatSession.update({
      where: { id },
      data: { title: input.message.slice(0, 50) },
    });
  } else {
    await context.prisma.aiChatSession.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }

  const encoder = new TextEncoder();
  let agentAbort = new AbortController();
  let onAbort: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      agentAbort = new AbortController();
      onAbort = () => {
        agentAbort.abort();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      if (req.signal && onAbort) {
        req.signal.addEventListener("abort", onAbort);
      }
      let assistantResponse = "";
      let assistantToolCalls: AgentResult["toolCalls"] = [];

      function send(event: AgentStreamEvent): void {
        const sse = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(sse));
      }

      try {
        await runWithAiSourceProposal(proposal, async () => {
          for await (const event of runAgentStream(
            history,
            input.message,
            agentAbort.signal,
          )) {
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
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Internal error";
        send({ type: "error", message });
        assistantResponse = message;
      }

      try {
        await context.prisma.aiChatMessage.create({
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
        // The response was already delivered; persistence failure is surfaced by
        // the next session reload rather than crashing the stream.
      }

      controller.enqueue(encoder.encode("event: close\ndata: {}\n\n"));
      controller.close();
      if (req.signal && onAbort) {
        req.signal.removeEventListener("abort", onAbort);
      }
    },
    cancel() {
      if (req.signal && onAbort) {
        req.signal.removeEventListener("abort", onAbort);
      }
      agentAbort.abort();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}, "POST /api/ai/sessions/[id]/messages/stream");
