// W3-F5 step 1: the conversation list as a string (the screen file draws it; tests read it).
import { CONVERSATIONS_MAX, type ConversationRow } from "../../../../../src/lib/connected-platform/contracts";
import { formatNumber, t } from "../../i18n";
import { renderEmpty } from "../../kit/empty-block";
import { renderError } from "../../kit/error-block";
import { renderSkeleton } from "../../kit/skeleton";
import { renderStateStrip } from "../../kit/state-strip";
import { esc } from "../view";
import { displayName, freshnessOf, isHeld, newestOf, phoneOf, snippetOf, sortConversations, whenLabel, type InboxModel } from "./model";

type Fresh = Pick<InboxModel, "locale" | "online" | "pcOff" | "now" | "asOf" | "timeZone">;
// The offline banner and the age strip, shared with the conversation.
export function renderFreshness(m: Fresh): string {
  const f = freshnessOf(m);
  const banner = m.online ? "" : `<div class="banner" role="status">${esc(t(m.locale, "common.offline"))}</div>`;
  if (f === "none" || m.asOf === null) return banner;
  const strip = f === "expired"
    ? `<div class="strip state-strip" role="status" data-state="expired"><strong>${esc(t(m.locale, "inbox.state.expired"))}</strong></div>`
    : renderStateStrip({ state: f, at: m.asOf, locale: m.locale, ...(m.timeZone ? { timeZone: m.timeZone } : {}) });
  return banner + strip;
}

function renderRow(c: ConversationRow, m: InboxModel): string {
  const L = m.locale; const id = esc(c.id); const name = displayName(c, L); const phone = phoneOf(c);
  const unread = Number.isFinite(c.unread) && c.unread > 0 ? `<span class="unread num" dir="ltr" aria-label="${esc(t(L, "inbox.unread", { n: formatNumber(c.unread) }))}">${formatNumber(c.unread)}</span>` : "";
  const held = isHeld(c) ? `<span class="held-badge">${esc(t(L, "inbox.held"))}</span>` : "";
  const phoneEl = phone ? `<span class="num phone" dir="ltr">${esc(phone)}</span>` : "";
  const snip = snippetOf(newestOf(c), L);
  return `<li class="row" data-id="${id}"><button type="button" class="row-main" data-act="open-chat" data-id="${id}" data-key="row:${id}" aria-label="${esc(t(L, "inbox.open", { name }))}"><span class="who"><bdi>${esc(name)}</bdi></span><span class="when num" dir="ltr">${esc(whenLabel(c.lastAt, m.now, L, m.timeZone))}</span>${phoneEl}${unread}<span class="snip" dir="auto">${esc(snip)}</span>${held}</button></li>`;
}

export function renderInboxList(m: InboxModel): string {
  const L = m.locale;
  const head = `<h1>${esc(t(L, "inbox.title"))}</h1>${renderFreshness(m)}`;
  const section = (inner: string): string => `<section class="inbox" data-screen="inbox">${head}${inner}</section>`;
  if (m.data === null && m.read !== "error") return section(renderSkeleton({ rows: 8, label: t(L, "common.loading") }));
  const error = m.read === "error"
    ? renderError({ title: t(L, "inbox.error.read"), body: t(L, m.data === null ? "inbox.error.none" : "inbox.error.kept"), retryAct: "inbox-retry", retryLabel: t(L, "common.retry") }) : "";
  let body = ""; let window = "";
  if (m.data !== null) {
    const rows = sortConversations(m.data.conversations);
    body = rows.length > 0 ? `<ul class="rows">${rows.map((c) => renderRow(c, m)).join("")}</ul>` : renderEmpty({ body: t(L, "inbox.empty") });
    window = rows.length >= CONVERSATIONS_MAX ? `<p class="hint window" role="status">${esc(t(L, "inbox.window", { n: formatNumber(CONVERSATIONS_MAX) }))}</p>` : "";
  }
  return section(`${error}${window}${body}`);
}
