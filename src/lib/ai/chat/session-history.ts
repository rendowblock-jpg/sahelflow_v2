import "server-only";

import type { DbClient } from "@/lib/db";

export const AI_CHAT_HISTORY_LIMIT = 20;

export async function loadRecentAiChatMessages(
  prisma: DbClient,
  sessionId: string,
  limit = AI_CHAT_HISTORY_LIMIT,
) {
  const boundedLimit = Math.max(1, Math.min(limit, 100));
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
