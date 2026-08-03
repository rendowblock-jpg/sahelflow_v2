import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAiActionProposal } from "@/lib/ai/actions/service";
import { runWithAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getCurrentUserKey, requireAuth } from "@/lib/auth/server";
import { runAgent, type AgentMessage } from "@/lib/ai/chat/agent";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { db, shopContext } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { requireLicense } from "@/lib/license/license-server";
import { redactPii } from "@/lib/redact-pii";
import { getBool, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const { id } = await params;
    const session = await db.aiChatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  },
  "GET /api/ai/sessions/[id]/messages",
);

const sendSchema = z.object({
  message: z.string().min(1).max(4000),
});

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
}

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const requester = await requireTrustedActor();
    const context = { prisma: db, shop: shopContext };
    const consent = await getBool(
      context,
      SETTING_KEYS.geminiConsentAccepted,
      false,
    );
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

    await requireLicense();
    const { id } = await params;
    const userKey = await getCurrentUserKey();
    const rateLimit = checkRateLimit(id, userKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason ?? "Rate limited" },
        { status: 429 },
      );
    }
    const input = sendSchema.parse(await request.json());

    const session = await db.aiChatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const userMessage = await context.prisma.aiChatMessage.create({
      data: { sessionId: id, role: "user", content: input.message },
    });
    const history = historyFrom(session.messages);
    const result = await runWithAiActionProposalRuntime(
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
      () =>
        runAgent(history, input.message, {
          db,
          shop: shopContext,
          sourceIdentity: `ai-session:${id}`,
        }),
    );

    await context.prisma.aiChatMessage.create({
      data: {
        sessionId: id,
        role: "assistant",
        content: result.response || "(erreur)",
        toolCalls:
          result.toolCalls.length > 0
            ? JSON.stringify(redactPii(result.toolCalls))
            : null,
      },
    });

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

    return NextResponse.json({
      response: result.response,
      toolCalls: result.toolCalls,
      error: result.error,
      actionProposal: result.actionProposal,
    });
  },
  "POST /api/ai/sessions/[id]/messages",
);
