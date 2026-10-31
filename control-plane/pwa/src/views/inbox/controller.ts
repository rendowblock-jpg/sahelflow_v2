// W3-F5: what a tap does. No DOM here: the screen file passes in the names and values it read from the page.
import type { ConversationRow, ConversationsProjection } from "../../../../../src/lib/connected-platform/contracts";
import type { Locale } from "../../i18n";
import type { EnqueueInput, EnqueueResult } from "../../outbox/outbox";
import type { OutboxRecord } from "../../outbox/state";
import { draftKey, submitNote, type DraftStore, type NotesError } from "../notes";
import { renderInboxList } from "./list";
import { REPLY_MAX, canReply, lastSeenIdOf, openReplyFor, repliesFor, type InboxModel, type ReadStatus } from "./model";
import { renderThread } from "./thread";

// The reply as the PC's strict schema wants it: NEVER a `to`, never a phone number, never a force flag (there is no "Send anyway").
export type ReplyInput = Readonly<{ conversationId: string; text: string; lastSeenMessageId: string }>;
export type InboxHost = Readonly<{
  now(): number; locale(): Locale; online(): boolean; pcOff(): boolean; timeZone?: string;
  read(): Readonly<{ status: ReadStatus; data: ConversationsProjection | null; asOf: number | null }>;
  reload(): Promise<void>;
  commands(): Promise<readonly OutboxRecord[]>;
  enqueueReply(i: ReplyInput): Promise<EnqueueResult>;
  enqueueNote(i: EnqueueInput): Promise<EnqueueResult>;
  drafts: DraftStore;
  authorityExpiresAt(): number | undefined;
  go(screen: "inbox" | "conversation"): void;
  subscribe(fn: () => void): () => void;
}>;
export type ActData = Readonly<{ id?: string; text?: string }>;
export const replyDraftKey = (conversationId: string): string => `draft.reply.${conversationId}`;

export function createInboxController(host: InboxHost) {
  let openId: string | null = null; let seen: ConversationRow | null = null; let draft = ""; let noteDraft = "";
  let noteError: NotesError | null = null; let notice: "busy" | "failed" | null = null; let dismissed: readonly string[] = []; /* dismissed = hidden by Try again only */ let commands: readonly OutboxRecord[] = [];

  function model(): InboxModel {
    const r = host.read(); const authority = host.authorityExpiresAt();
    return {
      locale: host.locale(), now: host.now(), online: host.online(), pcOff: host.pcOff(), ...(host.timeZone ? { timeZone: host.timeZone } : {}),
      read: r.status, data: r.data, asOf: r.asOf, commands, openId, seen, draft, noteDraft, noteError, notice, dismissed, ...(authority === undefined ? {} : { authorityExpiresAt: authority }),
    };
  }
  const latest = (): ConversationRow | undefined => host.read().data?.conversations.find((c) => c.id === openId);
  // Commands only (what a sync tick needs); the drafts are read once, when a chat opens, so a tick never overwrites what he is typing.
  async function refreshCommands(): Promise<void> { commands = await host.commands(); }
  async function refresh(): Promise<void> {
    commands = await host.commands();
    draft = openId ? await host.drafts.get(replyDraftKey(openId)) : "";
    noteDraft = openId ? await host.drafts.get(draftKey("conversation", openId)) : "";
  }
  async function afterEnqueue(res: EnqueueResult, id: string, text: string): Promise<void> {
    if (res.ok) { notice = null; draft = ""; await host.drafts.clear(replyDraftKey(id)); }
    else { notice = res.reason === "target_busy" ? "busy" : "failed"; draft = text; await host.drafts.set(replyDraftKey(id), text); } // a refusal never loses the text
    await refreshCommands();
  }
  async function act(name: string, d: ActData): Promise<void> {
    switch (name) {
      case "open-chat": {
        const c = host.read().data?.conversations.find((x) => x.id === d.id);
        openId = d.id ?? null; seen = c ?? null; notice = null; noteError = null;
        await refresh(); host.go("conversation"); return;
      }
      case "back": openId = null; seen = null; notice = null; noteError = null; draft = ""; noteDraft = ""; host.go("inbox"); return;
      case "inbox-retry": await host.reload(); await refreshCommands(); return;
      case "reload-thread": seen = latest() ?? seen; return; // he has now seen the newer message: the next send points at it
      case "reply-draft": draft = d.text ?? ""; if (openId) await host.drafts.set(replyDraftKey(openId), draft); return;
      case "reply-send": {
        const id = openId; if (!id) return;
        const m = model(); const text = (d.text ?? draft).trim(); const lastSeen = lastSeenIdOf(latest(), seen);
        if (!canReply(m) || openReplyFor(m, id) !== undefined || text === "" || text.length > REPLY_MAX || lastSeen === undefined) return;
        await afterEnqueue(await host.enqueueReply({ conversationId: id, text, lastSeenMessageId: lastSeen }), id, text); return;
      }
      case "cmd-retry": {
        // Re-sync, then put the text back in the composer. Nothing is sent until he taps Send again.
        const id = openId; if (!id) return;
        const list = repliesFor(model(), id); const last = list[list.length - 1];
        if (last?.resultCode === "ALREADY_ANSWERED") return; // the PC already answered: there is nothing to try again
        await host.reload(); await refreshCommands();
        if (last) { dismissed = [...dismissed, last.commandId]; if (draft === "" && last.draftText !== "") { draft = last.draftText; await host.drafts.set(replyDraftKey(id), draft); } }
        return;
      }
      case "note-draft": if (openId) { noteDraft = d.text ?? ""; await host.drafts.set(draftKey("conversation", openId), noteDraft); } return;
      case "note-send": {
        const c = latest() ?? seen; if (!c || !canReply(model())) return;
        const text = d.text ?? noteDraft;
        const r = await submitNote({ entityType: "conversation", entityId: c.id, noteVersion: c.noteVersion }, text, { enqueue: (i) => host.enqueueNote(i), drafts: host.drafts });
        noteError = r === "queued" ? null : r === "empty" ? "empty" : r === "too_long" ? "long" : r === "busy" ? "busy" : "send";
        await refresh(); // the draft is read back from the store: cleared when the note was saved, kept otherwise
        if (r !== "queued") noteDraft = text;
        return;
      }
      default: return;
    }
  }
  return { model, html: (): string => (openId ? renderThread(model()) : renderInboxList(model())), act, refresh, refreshCommands };
}
