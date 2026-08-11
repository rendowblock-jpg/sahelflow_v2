import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAiActionProposal } from "@/lib/ai/actions/service";
import { runWithAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import { runAgent, type AgentMessage } from "@/lib/ai/chat/agent";
import { withAiChatLocaleContext } from "@/lib/ai/chat/locale-context";
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

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const { id } = await params;
    const session = await db.aiChatSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json(
        { error: "AI_SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }
    const messages = await loadRecentAiChatMessages(db, id);
    return NextResponse.json({ session: { ...session, messages } });
  },
  "GET /api/ai/sessions/[id]/messages",
);

const sendSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  locale: z.enum(["en", "fr", "ar"]).optional().default("fr"),
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
      return NextResponse.json({ error: "consent_required" }, { status: 403 });
    }

    await requireLicense();
    const { id } = await params;
    const userKey = await getCurrentUserKey();
    const rateLimit = checkRateLimit(id, userKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "AI_RATE_LIMITED",
          reason: rateLimit.reason ?? null,
        },
        { status: 429 },
      );
    }
    const input = sendSchema.parse(await request.json());

    const session = await db.aiChatSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json(
        { error: "AI_SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }
    const recentMessages = await loadRecentAiChatMessages(db, id);

    const userMessage = await context.prisma.aiChatMessage.create({
      data: { sessionId: id, role: "user", content: input.message },
    });
    const history = historyFrom(recentMessages);
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
        runAgent(
          history,
          withAiChatLocaleContext(input.message, input.locale),
          {
            db,
            shop: shopContext,
            sourceIdentity: `ai-session:${id}`,
          },
        ),
    );

    if (result.response) {
      await context.prisma.aiChatMessage.create({
        data: {
          sessionId: id,
          role: "assistant",
          content: result.response,
          toolCalls:
            result.toolCalls.length > 0
              ? JSON.stringify(redactPii(result.toolCalls))
              : null,
        },
      });
    }
    await touchSessionAfterUserMessage(
      session,
      id,
      input.message,
      recentMessages.length > 0,
    );

    return NextResponse.json({
      response: result.response,
      toolCalls: result.toolCalls,
      error: result.error ?? null,
      actionProposal: result.actionProposal,
      persisted: Boolean(result.response),
    });
  },
  "POST /api/ai/sessions/[id]/messages",
);
