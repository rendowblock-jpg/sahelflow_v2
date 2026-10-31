// W3-F5: what the inbox screens know, and the rules that depend only on it (pure: no DOM, no clock, no storage).
import { COMMAND_EXPIRY_MS, type ConversationMessageRow, type ConversationRow, type ConversationsProjection } from "../../../../../src/lib/connected-platform/contracts";
import { formatTime, formatWeekday, t, type Locale } from "../../i18n";
import { isOpen, type OutboxRecord } from "../../outbox/state";
import type { NotesError } from "../notes";
import { freshnessOf, type Freshness, type ReadStatus } from "../orders/model";

export { freshnessOf };
export type { Freshness, ReadStatus };
export const REPLY_KIND = "command.messages.reply";
export const NOTE_KIND = "command.comments.write";
export const SNIPPET_MAX = 80;
export const REPLY_MAX = 4000;
const DAY_MS = 86_400_000;

export type InboxModel = Readonly<{
  locale: Locale; now: number; online: boolean; pcOff: boolean; timeZone?: string;
  read: ReadStatus; data: ConversationsProjection | null; asOf: number | null;
  commands: readonly OutboxRecord[];
  openId: string | null;
  // The copy of the open conversation that the user has LOOKED AT. A newer message waits behind "Reload".
  seen: ConversationRow | null;
  draft: string; noteDraft: string; noteError: NotesError | null; notice: "busy" | "failed" | null;
  // Reply commands the user dismissed with Discard (their chip is hidden).
  dismissed: readonly string[];
  authorityExpiresAt?: number;
}>;

// A role that may not see contact has no name and no number: "Customer", nothing else. Never "undefined", never "null".
export function displayName(c: Readonly<{ contactName?: unknown }>, locale: Locale): string {
  const n = c.contactName;
  return typeof n === "string" && n.trim() !== "" ? n.trim() : t(locale, "inbox.customer");
}
export function phoneOf(c: Readonly<{ phone?: unknown }>): string | null {
  const p = c.phone;
  return typeof p === "string" && p.trim() !== "" ? p.trim() : null;
}
export const isHeld = (c: Pick<ConversationRow, "messages">): boolean => c.messages.some((m) => m.held === true);
export const newestOf = (c: Pick<ConversationRow, "messages">): ConversationMessageRow | undefined => c.messages[c.messages.length - 1];

// Held chats first, then unread, then newest first. Stable, and the same order the projection already has.
export function sortConversations(list: readonly ConversationRow[]): ConversationRow[] {
  const rank = (c: ConversationRow): number => (isHeld(c) ? 0 : c.unread > 0 ? 1 : 2);
  const at = (c: ConversationRow): number => { const v = Date.parse(c.lastAt); return Number.isFinite(v) ? v : 0; };
  return list.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || at(b.c) - at(a.c) || a.i - b.i).map((x) => x.c);
}

export function kindWord(locale: Locale, type: string): string {
  const k = `inbox.type.${type}`; const v = t(locale, k);
  return v === k ? t(locale, "inbox.type.other") : v;
}
// The last message in 80 characters; an attachment is its placeholder word, never a url.
export function snippetOf(msg: ConversationMessageRow | undefined, locale: Locale): string {
  if (!msg) return "";
  if (msg.type !== "text") return kindWord(locale, msg.type);
  const chars = Array.from(msg.text.replace(/\s+/g, " ").trim());
  return chars.length > SNIPPET_MAX ? `${chars.slice(0, SNIPPET_MAX).join("")}…` : chars.join("");
}
// Under a day: the time. Older: the weekday. Digits through the kit's formatters, never toLocaleString.
export function whenLabel(iso: string, now: number, locale: Locale, timeZone?: string): string {
  const at = Date.parse(iso); if (!Number.isFinite(at)) return "";
  return now - at < DAY_MS ? formatTime(at, locale, timeZone) : formatWeekday(at, locale);
}

// ---- what the user has seen --------------------------------------------------------------------------
export function shownMessages(latest: ConversationRow | undefined, seen: ConversationRow | null): readonly ConversationMessageRow[] {
  if (!seen) return latest?.messages ?? [];
  if (!latest) return seen.messages;
  const seenId = newestOf(seen)?.id; if (seenId === undefined) return seen.messages;
  const at = latest.messages.findIndex((m) => m.id === seenId);
  return at < 0 ? seen.messages : latest.messages.slice(0, at + 1);
}
export function arrived(latest: ConversationRow | undefined, seen: ConversationRow | null): boolean {
  if (!latest || !seen) return false;
  const a = newestOf(latest)?.id; return a !== undefined && a !== newestOf(seen)?.id;
}
// A reply is composed against the newest message that is SHOWN, not the newest the phone knows.
export const lastSeenIdOf = (latest: ConversationRow | undefined, seen: ConversationRow | null): string | undefined => {
  const shown = shownMessages(latest, seen); return shown[shown.length - 1]?.id;
};

// ---- replies -------------------------------------------------------------------------------------------
export const repliesFor = (m: Pick<InboxModel, "commands">, conversationId: string): readonly OutboxRecord[] =>
  m.commands.filter((r) => r.kind === REPLY_KIND && r.target.type === "conversation" && r.target.id === conversationId).sort((a, b) => a.createdAt - b.createdAt);
export const openReplyFor = (m: Pick<InboxModel, "commands">, conversationId: string): OutboxRecord | undefined => repliesFor(m, conversationId).find((r) => isOpen(r.state));
// Expired data is read-only: nobody answers from a copy older than 24 hours.
export const canReply = (m: Pick<InboxModel, "now" | "asOf" | "online" | "pcOff">): boolean => { const f = freshnessOf(m); return f !== "expired" && f !== "none"; };
// The chip under the composer: an open reply, else the latest one unless dismissed. "Handed to WhatsApp" fades after the 4 h reply window.
export function replyChipFor(m: Pick<InboxModel, "commands" | "dismissed" | "now">, conversationId: string): OutboxRecord | undefined {
  const open = openReplyFor(m, conversationId); if (open) return open;
  const list = repliesFor(m, conversationId); const last = list[list.length - 1];
  if (!last || m.dismissed.includes(last.commandId)) return undefined;
  if (last.state === "committed" && last.resultCode !== "ALREADY_ANSWERED" && m.now - last.createdAt > COMMAND_EXPIRY_MS[REPLY_KIND]) return undefined;
  return last;
}
export const newestOut = (c: Pick<ConversationRow, "messages">): ConversationMessageRow | undefined => {
  for (let i = c.messages.length - 1; i >= 0; i -= 1) { const m = c.messages[i]; if (m && m.direction === "out" && !m.held) return m; }
  return undefined;
};
