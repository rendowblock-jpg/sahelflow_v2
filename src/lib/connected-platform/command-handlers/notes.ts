import { z } from "zod";
import { executeInternalComment } from "@/lib/collaboration/comments";
import { assertCommandPermission, authorizeRemoteCommand } from "./common";
import type { CommandHandler } from "./types";

const commentPayload = z.object({
  entityType: z.enum(["conversation", "order", "confirmation"]),
  entityId: z.string().trim().min(1).max(256),
  body: z.string().trim().min(1).max(4000),
  mentionMemberIds: z.array(z.string().regex(/^[0-9a-f]{32}$/i)).max(10).default([]),
  expectedVersion: z.number().int().nonnegative().safe(),
}).strict();

export const noteHandler: CommandHandler = async (input) => {
  const { context, envelope } = input;
  const actorContext = await authorizeRemoteCommand("command.comments.write", input);
  const data = commentPayload.parse(input.payload);
  // The note is on an order or a conversation: the member must be able to read THAT one.
  assertCommandPermission(
    actorContext,
    data.entityType === "conversation" ? "conversations.read" : "orders.read",
    context.shop.shopId,
  );
  const command = await executeInternalComment(context, actorContext, {
    ...data,
    idempotencyKey: `connected:${envelope.idempotencyKey}`,
    correlationId: envelope.envelopeId,
  });
  return {
    commentId: command.result.commentId,
    aggregateVersion: command.aggregateVersion,
    replayed: command.replayed,
  };
};
