// W3-F5 step 3: the reply composer and what a reply command says. The phone never invents a "delivered".
import type { ConversationRow } from "../../../../../src/lib/connected-platform/contracts";
import { formatTime, t } from "../../i18n";
import { renderChip } from "../../kit/command-chip";
import type { OutboxRecord } from "../../outbox/state";
import { esc } from "../view";
import { REPLY_MAX, canReply, newestOut, openReplyFor, replyChipFor, type InboxModel } from "./model";

const btn = (act: string, label: string, id: string, cls = "btn-ghost"): string => `<button type="button" class="btn ${cls}" data-act="${act}" data-id="${esc(id)}" data-key="act:${act}">${esc(label)}</button>`;

export function renderReplyCommand(r: OutboxRecord, c: ConversationRow, m: InboxModel): string {
  const L = m.locale; const code = r.resultCode;
  const chip = (tone: string, text: string, actions: string): string => `<div class="chip ${tone}" role="status" data-state="${r.state}"${code ? ` data-code="${esc(code)}"` : ""}><span>${esc(text)}</span>${actions}</div>`;
  // The PC already answered this chat: not a failure. A NEW command with force is the user's choice, never automatic.
  if (code === "ALREADY_ANSWERED" && (r.state === "failed" || r.state === "committed")) {
    const out = newestOut(c); const at = out ? Date.parse(out.at) : NaN;
    const text = Number.isFinite(at) ? t(L, "inbox.outcome.answered", { time: formatTime(at, L, m.timeZone) }) : t(L, "inbox.outcome.answered.notime");
    return chip("chip-neutral", text, `${btn("send-anyway", t(L, "cmd.sendAnyway"), r.commandId, "btn-primary")}${btn("discard", t(L, "inbox.discard"), r.commandId)}`);
  }
  const retry = btn("cmd-retry", t(L, "cmd.retry"), r.commandId);
  if (r.state === "expired") return chip("chip-failed", t(L, "inbox.reply.expired"), retry);
  if (r.state === "failed") {
    if (code === "SEND_GUARD_REFUSED") return chip("chip-failed", t(L, "inbox.outcome.guard"), retry);
    if (code === "EXPIRED") return chip("chip-failed", t(L, "inbox.outcome.expired"), retry);
    if (code === "PERMISSION_DENIED") return chip("chip-failed", t(L, "inbox.outcome.denied"), "");
  }
  // guarded = the PC's send guard warned, delayed or held it: still only "handed over".
  if (r.state === "committed" && (r as OutboxRecord & { guarded?: boolean }).guarded === true) return chip("chip-committed", t(L, "inbox.reply.guarded"), "");
  return renderChip({ record: r, locale: L, now: m.now, ...(m.authorityExpiresAt === undefined ? {} : { authorityExpiresAt: m.authorityExpiresAt }), ...(m.timeZone ? { timeZone: m.timeZone } : {}) });
}

export function renderReplyArea(m: InboxModel, c: ConversationRow): string {
  const L = m.locale; const id = esc(c.id);
  const rec = replyChipFor(m, c.id);
  const readOnly = !canReply(m);
  // One open reply per conversation: the form is disabled while one waits, and the chip says why.
  const dis = openReplyFor(m, c.id) !== undefined || readOnly ? " disabled" : "";
  const chip = rec ? renderReplyCommand(rec, c, m) : "";
  const notice = m.notice ? `<p class="note alert" role="alert">${esc(t(L, m.notice === "busy" ? "inbox.reply.busy" : "inbox.reply.failed"))}</p>` : "";
  const hint = readOnly ? `<p class="hint" role="status">${esc(t(L, "inbox.reply.readonly"))}</p>` : !m.online ? `<p class="hint" role="status">${esc(t(L, "inbox.reply.offline"))}</p>` : "";
  const form = `<form class="composer" data-form="composer" data-mode="reply" data-id="${id}"><label for="cmp-${id}">${esc(t(L, "cmd.composer.reply"))}</label><textarea id="cmp-${id}" name="text" rows="3" maxlength="${REPLY_MAX}" dir="auto" data-key="cmp:${id}"${dis}>${esc(m.draft)}</textarea><button type="submit" class="btn btn-primary" data-key="act:send"${dis}>${esc(t(L, "cmd.send"))}</button></form>`;
  return `<div class="reply" data-reply>${chip}${notice}${hint}${form}</div>`;
}
