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
import { readHeldMessageIds } from "./held-messages";
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

/** Held by the PC's send guard (read from the outbox intents), or already marked so in the column. */
function isHeldSource(src: MessageSource, heldIds: ReadonlySet<string>): boolean {
  return heldIds.has(src.id) || src.deliveryStatus === "held";
}

function toMessage(src: MessageSource, heldIds: ReadonlySet<string>): ConversationMessageRow {
  const type = messageType(src.messageType);
  // An attachment is a placeholder: its body can hold a media url or a path.
  const raw = type === "text" ? (src.body ?? "") : "";
  const text = cutText(raw, MESSAGE_TEXT_MAX_CHARS);
  const held = isHeldSource(src, heldIds);
  return {
    id: src.id,
    direction: src.direction.toLowerCase().startsWith("out") ? "out" : "in",
    text,
    truncated: text.length < raw.length,
    at: src.timestamp.toISOString(),
    // Both fields tell the same story: a held message is never reported as "sent".
    deliveryStatus: held ? "held" : (src.deliveryStatus ?? "sent"),
    held,
    type,
  };
}

function toRow(
  src: ConversationSource,
  contact: boolean,
  versions: ReadonlyMap<string, number>,
  heldIds: ReadonlySet<string>,
): ConversationRow {
  return {
    id: src.id,
    ...(contact && src.contactName ? { contactName: src.contactName } : {}),
    ...(contact && src.contactPhone ? { phone: src.contactPhone } : {}),
    status: src.status,
    unread: src.unreadCount,
    lastAt: (src.lastMessageAt ?? src.createdAt).toISOString(),
    noteVersion: versions.get(src.id) ?? 0,
    // The query is newest first; the phone reads oldest first.
    messages: [...src.messages].reverse().map((message) => toMessage(message, heldIds)),
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

const MESSAGE_SELECT = {
  id: true,
  body: true,
  direction: true,
  timestamp: true,
  deliveryStatus: true,
  messageType: true,
} as const;

/** Held messages older than the window are fetched by id; a chat never carries more than the window plus this. */
const HELD_EXTRA_MAX = 3;

function newestFirst(a: MessageSource, b: MessageSource): number {
  const diff = b.timestamp.getTime() - a.timestamp.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Window + older held messages, newest first, deduplicated; over the cap the oldest NON-held message goes first. */
function mergeHeldMessages(
  window: readonly MessageSource[],
  older: readonly MessageSource[],
  heldIds: ReadonlySet<string>,
): MessageSource[] {
  const seen = new Set(window.map((message) => message.id));
  const merged = [...window, ...older.filter((message) => !seen.has(message.id))].sort(newestFirst);
  const cap = MESSAGES_PER_CONVERSATION + HELD_EXTRA_MAX;
  while (merged.length > cap) {
    let drop = merged.length - 1;
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      const candidate = merged[i];
      if (candidate && !isHeldSource(candidate, heldIds)) {
        drop = i;
        break;
      }
    }
    merged.splice(drop, 1);
  }
  return merged;
}

async function buildConversationsProjection(contact: boolean): Promise<ConversationsProjection> {
  // A failing lookup fails the build (the worker keeps the last good snapshot): never publish "nothing held" by mistake.
  const lookup = await readHeldMessageIds();
  const heldIds: ReadonlySet<string> = new Set(Array.from(lookup.byMessageId.keys()));
  const heldConversationIds = Array.from(new Set(Array.from(lookup.byMessageId.values())));
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
      select: MESSAGE_SELECT,
    },
  };
  const order = [{ lastMessageAt: "desc" as const }, { id: "desc" as const }];
  // Chats with a held message come first, newest first, and count against the 20.
  const heldFirst = heldConversationIds.length > 0
    ? ((await db.conversation.findMany({
        where: { archivedAt: null, id: { in: heldConversationIds } },
        orderBy: order,
        take: CONVERSATIONS_MAX,
        select,
      })) as unknown as ConversationSource[])
    : [];
  const notHeld = heldFirst.length > 0 ? { id: { notIn: heldFirst.map((row) => row.id) } } : {};
  const unreadRoom = CONVERSATIONS_MAX - heldFirst.length;
  const unread = unreadRoom > 0
    ? ((await db.conversation.findMany({
        where: { archivedAt: null, unreadCount: { gt: 0 }, ...notHeld },
        orderBy: order,
        take: unreadRoom,
        select,
      })) as unknown as ConversationSource[])
    : [];
  const room = unreadRoom - unread.length;
  const rest = room > 0
    ? ((await db.conversation.findMany({
        where: { archivedAt: null, unreadCount: { lte: 0 }, ...notHeld },
        orderBy: order,
        take: room,
        select,
      })) as unknown as ConversationSource[])
    : [];
  const listed = [...heldFirst, ...unread, ...rest];
  // A held message older than the newest 10 of its chat: ONE query by id for all chats, merged into the window.
  const inWindow = new Set<string>();
  for (const row of listed) for (const message of row.messages) inWindow.add(message.id);
  const listedIds = new Set(listed.map((row) => row.id));
  const outside: string[] = [];
  lookup.byMessageId.forEach((conversationId, messageId) => {
    if (listedIds.has(conversationId) && !inWindow.has(messageId)) outside.push(messageId);
  });
  const older = new Map<string, MessageSource[]>();
  if (outside.length > 0) {
    const found = (await db.message.findMany({
      where: { id: { in: outside } },
      select: MESSAGE_SELECT,
    })) as unknown as MessageSource[];
    for (const message of found) {
      const conversationId = lookup.byMessageId.get(message.id);
      if (!conversationId) continue;
      older.set(conversationId, [...(older.get(conversationId) ?? []), message]);
    }
  }
  const all = listed.map((row) => {
    const more = older.get(row.id);
    return more ? { ...row, messages: mergeHeldMessages(row.messages, more, heldIds) } : row;
  });
  const versions = await readNoteVersions("conversation", all.map((row) => row.id));
  const conversations = all.map((row) => toRow(row, contact, versions, heldIds));
  return { conversations, window: windowOf(conversations) };
}

const hasHeld = (row: ConversationRow): boolean => row.messages.some((message) => message.held);

/** The newest `plain` messages that are not held, plus EVERY held message, in the original order. */
function keepNewestPlain(messages: readonly ConversationMessageRow[], plain: number): ConversationMessageRow[] {
  const kept: ConversationMessageRow[] = [];
  let room = plain;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    if (message.held) {
      kept.push(message);
    } else if (room > 0) {
      kept.push(message);
      room -= 1;
    }
  }
  return kept.reverse();
}

/**
 * Held messages are the last thing to go (they carry the owner's pending decision):
 * 1. the oldest plain messages, in every conversation, down to one plain message each;
 * 2. the plain messages of the chats that hold something (their held messages stay);
 * 3. whole conversations from the end, chats without a held message before chats with one.
 */
export function trimConversationsToBudget(
  projection: ConversationsProjection,
  budget: number,
): ConversationsProjection {
  if (bytesOf(projection) <= budget) return projection;
  const build = (list: readonly ConversationRow[], per: number, heldOnly: boolean): ConversationsProjection => {
    const conversations = list.map((row) => ({
      ...row,
      messages: keepNewestPlain(row.messages, heldOnly && hasHeld(row) ? 0 : per),
    }));
    return { conversations, window: windowOf(conversations) };
  };
  let list = projection.conversations;
  let per = projection.window.perConversationMessages;
  let heldOnly = false;
  let current = build(list, per, heldOnly);
  while (bytesOf(current) > budget && per > 1) {
    per -= 1;
    current = build(list, per, heldOnly);
  }
  if (bytesOf(current) > budget && list.some(hasHeld)) {
    heldOnly = true;
    current = build(list, per, heldOnly);
  }
  while (bytesOf(current) > budget && list.length > 0) {
    let drop = list.length - 1;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const row = list[i];
      if (row && !hasHeld(row)) {
        drop = i;
        break;
      }
    }
    list = list.filter((_, index) => index !== drop);
    current = build(list, per, heldOnly);
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
