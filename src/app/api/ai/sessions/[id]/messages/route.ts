import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAiActionProposal } from "@/lib/ai/actions/service";
import { AI_CHAT_MESSAGE_MAX_LENGTH } from "@/lib/ai/chat-limits";
import { runWithAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import { runAgent, type AgentMessage } from "@/lib/ai/chat/agent";
import { aiShopContextNote } from "@/lib/ai/chat/shop-context";
import {
  AI_CHAT_HISTORY_LIMIT,
  loadAiChatMessagesBefore,
  loadRecentAiChatMessages,
} from "@/lib/ai/chat/session-history";
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

/**
 * GET /api/ai/sessions/[id]/messages — recent window by default; ledger AI-08
 * adds an honest cursor protocol instead of the silent last-20 cap: pass
 * `cursor` (the id of the oldest message the client holds) to page older
 * history. Every response carries `hasMore` + `nextCursor` so the client can
 * offer "load earlier" and label truncated history truthfully.
 */
export const GET = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireAuth("ai.use");
    const { id } = await params;
    const session = await db.aiChatSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json(
        { error: "AI_SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }

    const cursor = request.nextUrl.searchParams.get("cursor")?.trim() || null;
    const requestedLimit = Number.parseInt(
      request.nextUrl.searchParams.get("limit") ?? "",
      10,
    );
    const limit = Number.isFinite(requestedLimit)
      ? requestedLimit
      : AI_CHAT_HISTORY_LIMIT;

    if (cursor) {
      const page = await loadAiChatMessagesBefore(db, id, cursor, limit);
      if (!page) {
        return NextResponse.json(
          { error: "AI_MESSAGE_NOT_FOUND" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        session: { ...session, messages: page.messages },
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      });
    }

    const messages = await loadRecentAiChatMessages(db, id, limit);
    const hasMore = messages.length > 0;
    const nextCursor = messages.length > 0 ? messages[0]!.id : null;
    return NextResponse.json({
      session: { ...session, messages },
      hasMore,
      nextCursor,
    });
  },
  "GET /api/ai/sessions/[id]/messages",
);

const sendSchema = z.object({
  message: z.string().trim().min(1).max(AI_CHAT_MESSAGE_MAX_LENGTH),
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
      // Audit S2-7: same coded dialect as the stream sibling; the legacy
      // `error` value stays verbatim for the UI's string normalization.
      return NextResponse.json(
        { error: "consent_required", code: "AI_CONSENT_REQUIRED" },
        { status: 403 },
      );
    }

    await requireLicense();
    const { id } = await params;
    const userKey = await getCurrentUserKey();
    const rateLimit = checkRateLimit(id, userKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "AI_RATE_LIMITED",
          code: "AI_RATE_LIMITED",
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
      async () => {
        // F-06: presentation-only shop snapshot; empty on failure, never a
        // turn-breaking dependency.
        const shopContextNote = await aiShopContextNote();
        return runAgent(
          history,
          input.message,
          {
            db,
            shop: shopContext,
            sourceIdentity: `ai-session:${id}`,
          },
          input.locale,
          shopContextNote,
        );
      },
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
