// STUB (red step): the reader answers "nothing held" until the real one is written.
import type { Prisma } from "@prisma/client";

export const HELD_MESSAGES_MAX = 200;

export interface HeldLookupClient {
  outboxIntent: {
    findMany(args: {
      where: Prisma.OutboxIntentWhereInput;
      orderBy: Prisma.OutboxIntentOrderByWithRelationInput[];
      take: number;
      select: { effectKey: true };
    }): PromiseLike<ReadonlyArray<{ effectKey: string }>>;
  };
  whatsAppOutboundEffect: {
    findMany(args: {
      where: Prisma.WhatsAppOutboundEffectWhereInput;
      select: { effectKey: true; messageId: true };
    }): PromiseLike<ReadonlyArray<{ effectKey: string; messageId: string }>>;
  };
  message: {
    findMany(args: {
      where: Prisma.MessageWhereInput;
      select: { id: true; conversationId: true };
    }): PromiseLike<ReadonlyArray<{ id: string; conversationId: string }>>;
  };
}

export type HeldMessageLookup = Readonly<{
  byMessageId: ReadonlyMap<string, string>;
  truncated: boolean;
}>;

export async function readHeldMessageIds(
  _client?: HeldLookupClient,
  _conversationIds?: readonly string[],
): Promise<HeldMessageLookup> {
  return { byMessageId: new Map<string, string>(), truncated: false };
}
