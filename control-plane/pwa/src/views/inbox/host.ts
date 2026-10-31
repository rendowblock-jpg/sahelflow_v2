// W3-F174 step 2: the inbox host. Everything the inbox screen needs from the rest of the app, behind one factory.
// The app gives it the outbox, the last sealed conversations projection and the sync tick; it never opens a socket itself.
import type { ConversationsProjection } from "../../../../../src/lib/connected-platform/contracts";
import type { Locale } from "../../i18n";
import type { EnqueueInput, EnqueueResult } from "../../outbox/outbox";
import type { OutboxRecord } from "../../outbox/state";
import type { DraftStore } from "../notes";
import type { InboxHost, ReplyInput } from "./controller";
import { displayName, type ReadStatus } from "./model";
import { t } from "../../i18n";

export type InboxHostDeps = Readonly<{
  outbox: Readonly<{ list(): Promise<readonly OutboxRecord[]>; enqueue(i: EnqueueInput): Promise<EnqueueResult> }>;
  readConversations(): Readonly<{ status: ReadStatus; data: ConversationsProjection | null; asOf: number | null }>;
  reload(): Promise<void>;
  drafts: DraftStore;
  subscribeAll(fn: () => void): () => void;
  go(screen: "inbox" | "conversation"): void;
  now(): number; locale(): Locale; online(): boolean; pcOff(): boolean; authorityExpiresAt(): number | undefined; timeZone?: string;
}>;

export function createInboxHost(d: InboxHostDeps): InboxHost {
  // The label stays on the phone (never in the payload): the contact's name, or "Customer" when this role may not see it.
  const labelFor = (conversationId: string): string => {
    const c = d.readConversations().data?.conversations.find((x) => x.id === conversationId);
    return c ? displayName(c, d.locale()) : t(d.locale(), "inbox.customer");
  };
  return {
    now: d.now, locale: d.locale, online: d.online, pcOff: d.pcOff, authorityExpiresAt: d.authorityExpiresAt, ...(d.timeZone === undefined ? {} : { timeZone: d.timeZone }),
    read: d.readConversations, reload: d.reload, commands: () => d.outbox.list(), drafts: d.drafts, go: d.go, subscribe: d.subscribeAll,
    // Exactly the PC's strict reply schema: id, text, the message he saw. Never a `to`, never a number, never force (see reply.ts).
    enqueueReply: (i: ReplyInput) => d.outbox.enqueue({
      kind: "command.messages.reply", target: { type: "conversation", id: i.conversationId }, labelForUi: labelFor(i.conversationId), draftText: i.text, extra: { lastSeenMessageId: i.lastSeenMessageId },
    }),
    // A note carries the version of the thread he saw: the outbox seals extra.expectedVersion (target.expectedVersion alone would seal 0).
    enqueueNote: (i: EnqueueInput) => {
      const version = i.extra?.expectedVersion ?? i.target.expectedVersion;
      return d.outbox.enqueue({ ...i, kind: "command.comments.write", target: { ...i.target, type: "conversation" }, extra: { ...(i.extra ?? {}), ...(version === undefined ? {} : { expectedVersion: version }) } });
    },
  };
}
