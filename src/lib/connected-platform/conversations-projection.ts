import "server-only";

import { db } from "@/lib/db";
import { resolveDashboardFieldAccess } from "@/lib/identity/dashboard-projection";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type { ConnectedPlatformClient } from "./client";
import {
  CONVERSATIONS_MAX,
  CONVERSATIONS_PLAINTEXT_BUDGET,
  CONVERSATION_MESSAGE_TYPES,
  MESSAGES_PER_CONVERSATION,
  MESSAGE_TEXT_MAX_CHARS,
  type ConversationMessageRow,
  type ConversationMessageType,
  type ConversationRow,
  type ConversationsProjection,
} from "./contracts";
import {
  PROJECTION_TTL_MS,
  assertSealable,
  nextProjectionSequence,
  resolveRemoteDevice,
  sealAndPutProjection,
} from "./desktop-projection";
import { readNoteVersions } from "./orders-projection";
import type { ConnectedKeyPair } from "./payload-crypto";

const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");

type MessageSource = Readonly<{
  id: string;
  body: string | null;
  direction: string;
  timestamp: Date;
  deliveryStatus: string | null;
  messageType: string | null;
}>;

type ConversationSource = Readonly<{
  id: string;
  contactName?: string | null;
  contactPhone?: string | null;
  status: string;
  unreadCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  messages: readonly MessageSource[];
}>;

/** Cut at max UTF-16 units without leaving half of an emoji. */
function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

function messageType(raw: string | null): ConversationMessageType {
  const value = raw ?? "text";
  return (CONVERSATION_MESSAGE_TYPES as readonly string[]).includes(value)
    ? (value as ConversationMessageType)
    : "other";
}

function toMessage(src: MessageSource): ConversationMessageRow {
  const type = messageType(src.messageType);
  // An attachment is a placeholder: its body can hold a media url or a path.
  const raw = type === "text" ? (src.body ?? "") : "";
  const text = cutText(raw, MESSAGE_TEXT_MAX_CHARS);
  return {
    id: src.id,
    direction: src.direction.toLowerCase().startsWith("out") ? "out" : "in",
    text,
    truncated: text.length < raw.length,
    at: src.timestamp.toISOString(),
    deliveryStatus: src.deliveryStatus ?? "sent",
    held: src.deliveryStatus === "held",
    type,
  };
}

function toRow(src: ConversationSource, contact: boolean, versions: ReadonlyMap<string, number>): ConversationRow {
  return {
    id: src.id,
    ...(contact && src.contactName ? { contactName: src.contactName } : {}),
    ...(contact && src.contactPhone ? { phone: src.contactPhone } : {}),
    status: src.status,
    unread: src.unreadCount,
    lastAt: (src.lastMessageAt ?? src.createdAt).toISOString(),
    noteVersion: versions.get(src.id) ?? 0,
    // The query is newest first; the phone reads oldest first.
    messages: [...src.messages].reverse().map(toMessage),
  };
}

const EMPTY: ConversationsProjection = {
  conversations: [],
  window: { conversations: 0, perConversationMessages: 0 },
};

function windowOf(list: readonly ConversationRow[]): ConversationsProjection["window"] {
  return {
    conversations: list.length,
    perConversationMessages: list.reduce((most, row) => Math.max(most, row.messages.length), 0),
  };
}

async function buildConversationsProjection(contact: boolean): Promise<ConversationsProjection> {
  // A column the member may not see is not selected, so it is never read.
  const select = {
    id: true,
    contactName: contact,
    contactPhone: contact,
    status: true,
    unreadCount: true,
    lastMessageAt: true,
    createdAt: true,
    messages: {
      orderBy: [{ timestamp: "desc" as const }, { id: "desc" as const }],
      take: MESSAGES_PER_CONVERSATION,
      select: { id: true, body: true, direction: true, timestamp: true, deliveryStatus: true, messageType: true },
    },
  };
  const order = [{ lastMessageAt: "desc" as const }, { id: "desc" as const }];
  const unread = (await db.conversation.findMany({
    where: { archivedAt: null, unreadCount: { gt: 0 } },
    orderBy: order,
    take: CONVERSATIONS_MAX,
    select,
  })) as unknown as ConversationSource[];
  const room = CONVERSATIONS_MAX - unread.length;
  const rest = room > 0
    ? ((await db.conversation.findMany({
        where: { archivedAt: null, unreadCount: { lte: 0 } },
        orderBy: order,
        take: room,
        select,
      })) as unknown as ConversationSource[])
    : [];
  const all = [...unread, ...rest];
  const versions = await readNoteVersions("conversation", all.map((row) => row.id));
  const conversations = all.map((row) => toRow(row, contact, versions));
  return { conversations, window: windowOf(conversations) };
}

/** Oldest messages go first (all conversations, down to one each), then the last conversations. */
export function trimConversationsToBudget(
  projection: ConversationsProjection,
  budget: number,
): ConversationsProjection {
  if (bytesOf(projection) <= budget) return projection;
  const build = (list: readonly ConversationRow[], per: number): ConversationsProjection => {
    const conversations = list.map((row) => ({
      ...row,
      messages: row.messages.slice(Math.max(0, row.messages.length - per)),
    }));
    return { conversations, window: windowOf(conversations) };
  };
  let list = projection.conversations;
  let per = projection.window.perConversationMessages;
  let current = build(list, per);
  while (bytesOf(current) > budget && per > 1) {
    per -= 1;
    current = build(list, per);
  }
  while (bytesOf(current) > budget && list.length > 0) {
    list = list.slice(0, -1);
    current = build(list, per);
  }
  return current;
}

export async function publishRemoteConversationsProjection(input: Readonly<{
  client: ConnectedPlatformClient;
  desktopKeys: ConnectedKeyPair;
  actorContext: TrustedActorContext;
  deviceId: string;
  now?: Date;
}>): Promise<Readonly<{ sequence: number }>> {
  const device = await resolveRemoteDevice(input.client, input.actorContext, input.deviceId);
  const fieldAccess = resolveDashboardFieldAccess(input.actorContext);
  const issuedAt = input.now ?? new Date();
  // No conversations.read: no message text is queried; an empty window replaces any older one.
  const built = fieldAccess.conversations
    ? await buildConversationsProjection(fieldAccess.customerContact)
    : EMPTY;
  const payload = trimConversationsToBudget(built, CONVERSATIONS_PLAINTEXT_BUDGET);
  assertSealable(payload);
  const sequence = await nextProjectionSequence("conversations", device.deviceId);
  await sealAndPutProjection({
    client: input.client,
    desktopKeys: input.desktopKeys,
    actorContext: input.actorContext,
    device,
    kind: "conversations",
    payload,
    sequence,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + PROJECTION_TTL_MS),
  });
  return Object.freeze({ sequence });
}
