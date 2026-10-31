// W3-F5 step 2: one conversation (bubbles, ticks, held, media, notes) as a string.
import { MESSAGES_PER_CONVERSATION, type ConversationMessageRow, type ConversationRow } from "../../../../../src/lib/connected-platform/contracts";
import { formatTime, t } from "../../i18n";
import { renderEmpty } from "../../kit/empty-block";
import { renderError } from "../../kit/error-block";
import { renderSkeleton } from "../../kit/skeleton";
import { esc } from "../view";
import { renderNotes } from "../notes";
import { renderFreshness } from "./list";
import { NOTE_KIND, arrived, canReply, displayName, kindWord, phoneOf, shownMessages, type InboxModel } from "./model";
import { renderReplyArea } from "./reply";

const TICKS: readonly string[] = ["sending", "sent", "delivered", "read", "failed"];

function renderBubble(msg: ConversationMessageRow, m: InboxModel): string {
  const L = m.locale; const out = msg.direction === "out"; const held = msg.held === true;
  const time = Date.parse(msg.at);
  const text = msg.type === "text" && msg.text !== "" ? `<p class="txt">${esc(msg.text)}</p>` : "";
  // No photo, no voice, no url exists on the phone: a sentence that says where to open it.
  const media = msg.type !== "text" ? `<p class="media">${esc(t(L, "inbox.media", { kind: kindWord(L, msg.type) }))}</p>` : "";
  const cut = msg.type === "text" && msg.truncated ? `<p class="trunc">${esc(t(L, "inbox.thread.truncated"))}</p>` : "";
  // Held = display only. The owner releases or discards it on the PC; there is no control for it here.
  const heldNote = held ? `<p class="held-badge">${esc(t(L, "inbox.held.note"))}</p>` : "";
  const tick = out && !held && TICKS.includes(msg.deliveryStatus) ? `<span class="tick" data-status="${esc(msg.deliveryStatus)}">${esc(t(L, `inbox.tick.${msg.deliveryStatus}`))}</span>` : "";
  const clock = Number.isFinite(time) ? `<time class="num" dir="ltr">${esc(formatTime(time, L, m.timeZone))}</time>` : "";
  return `<li class="bubble ${out ? "out" : "in"}" dir="auto" data-id="${esc(msg.id)}"><span class="sr">${esc(t(L, out ? "inbox.who.out" : "inbox.who.in"))}</span>${text}${media}${cut}${heldNote}<span class="meta">${clock}${tick}</span></li>`;
}

export function renderThread(m: InboxModel): string {
  const L = m.locale;
  const back = `<button type="button" class="btn btn-ghost back" data-act="back" data-key="act:back">${esc(t(L, "inbox.back"))}</button>`;
  const latest = m.data?.conversations.find((c) => c.id === m.openId);
  const c: ConversationRow | undefined = latest ?? m.seen ?? undefined;
  const wrap = (inner: string): string => `<section class="inbox" data-screen="conversation"${m.openId ? ` data-id="${esc(m.openId)}"` : ""}>${back}${inner}</section>`;
  if (!c) {
    if (m.data === null && m.read !== "error") return wrap(renderSkeleton({ rows: 6, label: t(L, "common.loading") }));
    return wrap(renderError({ title: t(L, "inbox.thread.error"), body: t(L, "inbox.thread.gone"), retryAct: "inbox-retry", retryLabel: t(L, "common.retry") }));
  }
  const phone = phoneOf(c);
  const head = `<h1><bdi>${esc(displayName(c, L))}</bdi></h1>${phone ? `<p class="num phone" dir="ltr">${esc(phone)}</p>` : ""}${renderFreshness(m)}`;
  const news = arrived(latest, m.seen)
    ? `<div class="strip arrived" role="status"><strong>${esc(t(L, "inbox.thread.arrived"))}</strong><button type="button" class="btn btn-ghost" data-act="reload-thread" data-key="act:reload">${esc(t(L, "inbox.thread.reload"))}</button></div>` : "";
  const msgs = shownMessages(latest, m.seen);
  const older = msgs.length >= MESSAGES_PER_CONVERSATION ? `<p class="hint older" role="status">${esc(t(L, "inbox.thread.older"))}</p>` : "";
  const list = msgs.length === 0 ? renderEmpty({ body: t(L, "inbox.thread.empty") }) : `<ol class="thread">${msgs.map((x) => renderBubble(x, m)).join("")}</ol>`;
  const notes = renderNotes({
    entityType: "conversation", entityId: c.id, noteVersion: c.noteVersion,
    notes: m.commands.filter((r) => r.kind === NOTE_KIND && r.target.type === "conversation" && r.target.id === c.id),
    draft: m.noteDraft, locale: L, now: m.now, online: m.online, error: m.noteError, readOnly: !canReply(m),
    ...(m.authorityExpiresAt === undefined ? {} : { authorityExpiresAt: m.authorityExpiresAt }), ...(m.timeZone ? { timeZone: m.timeZone } : {}),
  });
  return wrap(`${head}${news}${older}${list}${renderReplyArea(m, c)}${notes}`);
}
