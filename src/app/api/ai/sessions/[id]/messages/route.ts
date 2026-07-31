import { NextRequest, NextResponse } from "next/server";
import { requireLicense } from "@/lib/license/license-server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { runAgent, type AgentMessage } from "@/lib/ai/chat/agent";
import {
  resolveAiSourceProposalContext,
  runWithAiSourceProposal,
} from "@/lib/ai/chat/source-proposal";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { redactPii } from "@/lib/redact-pii";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, getCurrentUserKey } from "@/lib/auth/server";
import { getBool, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: RouteContext) => {
    await requireAuth();
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

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: RouteContext) => {
    await requireAuth();
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
    const input = sendSchema.parse(await req.json());

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
    const result = await runWithAiSourceProposal(proposal, () =>
      runAgent(history, input.message),
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
      pendingConfirmation: result.pendingConfirmation,
    });
  },
  "POST /api/ai/sessions/[id]/messages",
);
