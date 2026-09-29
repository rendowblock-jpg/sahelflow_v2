-- Agents rail: durable seller pins on AI chat sessions.
-- Additive and nullable: every existing session keeps its exact current
-- meaning (unpinned) and its recency order.

ALTER TABLE "AiChatSession" ADD COLUMN "pinnedAt" DATETIME;
