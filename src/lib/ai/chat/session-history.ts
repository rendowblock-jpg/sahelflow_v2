import "server-only";

import type { DbClient } from "@/lib/db";

export const AI_CHAT_HISTORY_LIMIT = 20;

export const AI_CHAT_HISTORY_MAX_LIMIT = 100;

export async function loadRecentAiChatMessages(
  prisma: DbClient,
  sessionId: string,
  limit = AI_CHAT_HISTORY_LIMIT,
) {
  const boundedLimit = Math.max(1, Math.min(limit, AI_CHAT_HISTORY_MAX_LIMIT));
  const rows = await prisma.aiChatMessage.findMany({
    where: { sessionId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: boundedLimit,
    select: {
      id: true,
      role: true,
      content: true,
      toolCalls: true,
      createdAt: true,
    },
  });

  return rows.reverse();
}

export interface AiChatHistoryPage {
  messages: Awaited<ReturnType<typeof loadRecentAiChatMessages>>;
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Ledger AI-08: cursor page of messages strictly OLDER than `cursorMessageId`
 * (the id of the oldest message the client currently holds). Uses the same
 * (createdAt, id) composite ordering as the recent window so pages can never
 * overlap or skip rows. The returned page is chronological (ascending).
 */
export async function loadAiChatMessagesBefore(
  prisma: DbClient,
  sessionId: string,
  cursorMessageId: string,
  limit = AI_CHAT_HISTORY_LIMIT,
): Promise<AiChatHistoryPage | null> {
  const boundedLimit = Math.max(1, Math.min(limit, AI_CHAT_HISTORY_MAX_LIMIT));
  const cursor = await prisma.aiChatMessage.findFirst({
    where: { id: cursorMessageId, sessionId },
    select: { id: true, createdAt: true },
  });
  if (!cursor) return null;

  const rows = await prisma.aiChatMessage.findMany({
    where: {
      sessionId,
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: boundedLimit + 1,
    select: {
      id: true,
      role: true,
      content: true,
      toolCalls: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > boundedLimit;
  const page = (hasMore ? rows.slice(0, boundedLimit) : rows).reverse();
  return {
    messages: page,
    hasMore,
    nextCursor: page.length > 0 ? page[0]!.id : null,
  };
}
