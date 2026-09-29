import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import {
  deriveAiSessionTitle,
  isDerivableAiSessionTitle,
} from "@/lib/ai/chat/session-title";
import { requireLicense } from "@/lib/license/license-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/sessions — list chat sessions with the latest durable preview.
 *
 * A session still wearing a placeholder title (the legacy French seed or an
 * old development seed's "Session N") is presented under a title derived from
 * its first question — the same derivation the message routes apply on a first
 * turn. The projection is read-only: a GET never writes, so read-only license
 * states stay honest, and the next real turn persists a title as usual.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth("ai.use");
  const sessions = await db.aiChatSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  });
  const healed = await Promise.all(
    sessions.map(async (session) => {
      if (session.title === null || !isDerivableAiSessionTitle(session.title)) {
        return session;
      }
      const firstQuestion = await db.aiChatMessage.findFirst({
        where: { sessionId: session.id, role: "user" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { content: true },
      });
      const derived = firstQuestion
        ? deriveAiSessionTitle(firstQuestion.content)
        : "";
      return { ...session, title: derived || null };
    }),
  );
  return NextResponse.json({ sessions: healed });
}, "GET /api/ai/sessions");

const createSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
});

/** POST /api/ai/sessions — create a new locale-neutral chat session. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("ai.use");
  await requireLicense();
  const body = await req.json().catch(() => ({}));
  const input = createSchema.parse(body);
  const context = { prisma: db, shop: shopContext };
  const session = await context.prisma.aiChatSession.create({
    data: { title: input.title ?? null },
  });
  return NextResponse.json({ session }, { status: 201 });
}, "POST /api/ai/sessions");
