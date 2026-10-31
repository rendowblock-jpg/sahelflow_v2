// Shared fixtures for the inbox tests (W3-F5). A FAKE host: no relay, no crypto, no outbox.
import type { ConversationMessageRow, ConversationRow, ConversationsProjection } from "../../../src/lib/connected-platform/contracts";
import type { EnqueueInput, EnqueueResult } from "../src/outbox/outbox";
import type { OutboxRecord } from "../src/outbox/state";
import type { Locale } from "../src/i18n";
import { createDraftStore, type DraftStore } from "../src/views/notes";
import type { InboxModel } from "../src/views/inbox/model";
import type { InboxHost, ReplyInput } from "../src/views/inbox/controller";
import { NOW, memDb, rec } from "./orders-fixtures";

export { NOW, memDb, rec };
export const iso = (ms: number): string => new Date(ms).toISOString();
export const msg = (o: Partial<ConversationMessageRow> = {}): ConversationMessageRow => ({
  id: "m1", direction: "in", text: "Bonjour, la robe est disponible ?", truncated: false, at: iso(NOW - 3_600_000), deliveryStatus: "received", held: false, type: "text", ...o,
});
export const conv = (o: Partial<ConversationRow> = {}): ConversationRow => ({
  id: "c1", contactName: "Amina B.", phone: "0550123456", status: "open", unread: 2, lastAt: iso(NOW - 3_600_000), noteVersion: 4,
  messages: [msg({ id: "m1" }), msg({ id: "m2", direction: "out", text: "Oui, elle est là", deliveryStatus: "read", at: iso(NOW - 1_800_000) }), msg({ id: "m3", text: "Et la taille M ?" })], ...o,
});
// A role that may not see contact: the keys are ABSENT, not undefined.
export const anon = (c: ConversationRow): ConversationRow => { const o: Record<string, unknown> = { ...c }; delete o.contactName; delete o.phone; return o as ConversationRow; };
export const proj = (list: readonly ConversationRow[]): ConversationsProjection => ({
  conversations: list, window: { conversations: list.length, perConversationMessages: Math.max(0, ...list.map((c) => c.messages.length)) },
});
export const mk = (o: Partial<InboxModel> = {}): InboxModel => ({
  locale: "en", now: NOW, online: true, pcOff: false, timeZone: "UTC", read: "ready", data: proj([conv()]), asOf: NOW - 60_000, commands: [],
  openId: null, seen: null, draft: "", noteDraft: "", noteError: null, notice: null, dismissed: [], ...o,
});
export const reply = (o: Partial<OutboxRecord> = {}): OutboxRecord => rec({
  commandId: "r1", kind: "command.messages.reply", target: { type: "conversation", id: "c1", lastSeenMessageId: "m3" }, labelForUi: "Amina B.", draftText: "Oui, taille M disponible", ...o,
});
export const okResult = (r: OutboxRecord = reply()): EnqueueResult => ({ ok: true, record: r });

export type FakeOpts = Partial<{
  data: ConversationsProjection | null; status: "loading" | "error" | "ready"; commands: readonly OutboxRecord[]; online: boolean; locale: Locale;
  asOf: number | null; replyResult: EnqueueResult; drafts: DraftStore;
}>;
export function fakeHost(o: FakeOpts = {}) {
  const log = { replies: [] as ReplyInput[], notes: [] as EnqueueInput[], go: [] as string[], reloads: 0 };
  const state = {
    data: (o.data === undefined ? proj([conv()]) : o.data) as ConversationsProjection | null, status: o.status ?? "ready", commands: o.commands ?? [],
    asOf: (o.asOf === undefined ? NOW - 60_000 : o.asOf) as number | null, online: o.online ?? true, replyResult: o.replyResult ?? okResult(),
  };
  const listeners = new Set<() => void>();
  const drafts = o.drafts ?? createDraftStore(memDb(), () => NOW);
  const host: InboxHost = {
    now: () => NOW, locale: () => o.locale ?? "en", online: () => state.online, pcOff: () => false, timeZone: "UTC",
    read: () => ({ status: state.status, data: state.data, asOf: state.asOf }),
    reload: async () => { log.reloads += 1; },
    commands: async () => state.commands,
    enqueueReply: async (i) => { log.replies.push(i); return state.replyResult; },
    enqueueNote: async (i) => { log.notes.push(i); return okResult(rec({ kind: "command.comments.write" })); },
    drafts, authorityExpiresAt: () => undefined,
    go: (s) => { log.go.push(s); },
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
  return { host, log, state, drafts, notify: () => listeners.forEach((f) => f()) };
}
export const rowIds = (html: string): string[] => [...html.matchAll(/<li class="row"[^>]*data-id="([^"]+)"/g)].map((m) => m[1] ?? "");
export const bubbleIds = (html: string): string[] => [...html.matchAll(/<li class="bubble[^"]*"[^>]*data-id="([^"]+)"/g)].map((m) => m[1] ?? "");
export const bubble = (html: string, id: string): string => html.match(new RegExp(`<li class="bubble[^"]*"[^>]*data-id="${id}"[\\s\\S]*?</li>`))?.[0] ?? "";
