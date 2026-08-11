import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { runWithAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import { createAiActionProposal } from "@/lib/ai/actions/service";
import {
  runAgentStream,
  type AgentMessage,
  type AgentResult,
  type AgentStreamEvent,
} from "@/lib/ai/chat/agent";
import { loadRecentAiChatMessages } from "@/lib/ai/chat/session-history";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getCurrentUserKey, requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { requireLicense } from "@/lib/license/license-server";
import { redactPii } from "@/lib/redact-pii";
import { getBool, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  locale: z.enum(["en", "fr", "ar"]).optional().default("fr"),
});

type WorkspaceStreamEvent =
  | AgentStreamEvent
  | {
      type: "persistence_warning";
      code: "AI_RESPONSE_NOT_PERSISTED";
    };

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return new NextResponse(JSON.stringify({ error, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function historyFrom(
  messages: Array<{
    role: string;
    content: string;
    toolCalls: string | null;
  }>,
): AgentMessage[] {
  return messages.map((message) => {
    let toolCalls: AgentMessage["toolCalls"];
    if (message.role === "assistant" && message.toolCalls) {
      try {
        const parsed = JSON.parse(message.toolCalls) as unknown;
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
}

async function touchSessionAfterUserMessage(
  session: { title: string | null },
  sessionId: string,
  message: string,
  hadHistory: boolean,
) {
  if (!hadHistory && (!session.title || session.title === "Nouvelle conversation")) {
    await db.aiChatSession.update({
      where: { id: sessionId },
      data: { title: message.slice(0, 50) },
    });
    return;
  }
  await db.aiChatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });
}

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const context = { prisma: db, shop: shopContext };

    await requireAuth("ai.use");
    const requester = await requireTrustedActor();
    const consent = await getBool(
      context,
      SETTING_KEYS.geminiConsentAccepted,
      false,
    );
    if (!consent) {
      return jsonError(403, "consent_required");
    }

    try {
      await requireLicense();
    } catch {
      return jsonError(403, "AI_LICENSE_REQUIRED");
    }

    const userKey = await getCurrentUserKey();
    const rateLimit = checkRateLimit(id, userKey);
    if (!rateLimit.allowed) {
      return jsonError(429, "AI_RATE_LIMITED", {
        reason: rateLimit.reason ?? null,
      });
    }

    let input: z.infer<typeof sendSchema>;
    try {
      input = sendSchema.parse(await request.json());
    } catch (error) {
      if (error instanceof z.ZodError) {
        return jsonError(400, "AI_INVALID_MESSAGE", { details: error.issues });
      }
      return jsonError(400, "AI_INVALID_REQUEST");
    }

    const session = await db.aiChatSession.findUnique({ where: { id } });
    if (!session) {
      return jsonError(404, "AI_SESSION_NOT_FOUND");
    }
    const recentMessages = await loadRecentAiChatMessages(db, id);

    const userMessage = await context.prisma.aiChatMessage.create({
      data: { sessionId: id, role: "user", content: input.message },
    });
    const history = historyFrom(recentMessages);
    await touchSessionAfterUserMessage(
      session,
      id,
      input.message,
      recentMessages.length > 0,
    );

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
        request.signal.addEventListener("abort", onAbort);
        let assistantResponse = "";
        let assistantToolCalls: AgentResult["toolCalls"] = [];
        let shouldPersistAssistant = false;

        function send(event: WorkspaceStreamEvent): void {
          controller.enqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        }

        try {
          await runWithAiActionProposalRuntime(
            {
              createProposal: (toolName, args) =>
                createAiActionProposal({
                  context,
                  requester,
                  sessionId: id,
                  requestMessageId: userMessage.id,
                  toolName,
                  rawArgs: args,
                }),
            },
            async () => {
              for await (const event of runAgentStream(
                history,
                input.message,
                agentAbort.signal,
                {
                  db,
                  shop: shopContext,
                  sourceIdentity: `ai-session:${id}`,
                },
                input.locale,
              )) {
                send(event);
                if (event.type === "text_delta") {
                  assistantResponse += event.text;
                } else if (event.type === "done") {
                  assistantResponse = event.response;
                  assistantToolCalls = event.toolCalls;
                  shouldPersistAssistant = Boolean(event.response);
                } else if (event.type === "error") {
                  shouldPersistAssistant = false;
                }
              }
            },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "AI_INTERNAL_ERROR";
          send({ type: "error", message });
          shouldPersistAssistant = false;
        }

        if (shouldPersistAssistant) {
          try {
            await context.prisma.aiChatMessage.create({
              data: {
                sessionId: id,
                role: "assistant",
                content: assistantResponse,
                toolCalls:
                  assistantToolCalls.length > 0
                    ? JSON.stringify(redactPii(assistantToolCalls))
                    : null,
              },
            });
          } catch {
            send({
              type: "persistence_warning",
              code: "AI_RESPONSE_NOT_PERSISTED",
            });
          }
        }

        try {
          controller.enqueue(encoder.encode("event: close\ndata: {}\n\n"));
          controller.close();
        } catch {
          // The request may have been aborted and closed already.
        }
        if (onAbort) request.signal.removeEventListener("abort", onAbort);
      },
      cancel() {
        if (onAbort) request.signal.removeEventListener("abort", onAbort);
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
  },
  "POST /api/ai/sessions/[id]/messages/stream",
);
