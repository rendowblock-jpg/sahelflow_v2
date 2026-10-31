// W3-F4 step 2 + 4: one order, the decision on it, and the notes. Fields the role may not see are named, never blanked.
import type { OrderProjectionRow } from "../../../../../src/lib/connected-platform/contracts";
import { formatDzd, t } from "../../i18n";
import { renderConfirmSheet } from "../../kit/confirm-sheet";
import { renderEmpty } from "../../kit/empty-block";
import { renderError } from "../../kit/error-block";
import { renderSkeleton } from "../../kit/skeleton";
import { renderNotes } from "../notes";
import { esc, numText } from "../view";
import { renderFreshness } from "./list";
import { ageLabel, canAct, changedSinceOpened, isPending, latestCommandFor, openCommandFor, statusLabel, type OrdersModel } from "./model";
import { renderOrderCommand } from "./outcome";

const LRI = "\u2066"; const PDI = "\u2069";

function renderFacts(o: OrderProjectionRow, m: OrdersModel): string {
  const L = m.locale; const hidden = `<dd class="hidden">${esc(t(L, "orders.detail.hidden"))}</dd>`;
  const fact = (label: string, value: string | undefined, html: (v: string) => string): string => `<div class="fact"><dt>${esc(label)}</dt>${value === undefined ? hidden : `<dd>${html(value)}</dd>`}</div>`;
  const dial = (p: string): string => { const n = p.replace(/[^\d+]/g, ""); return n === "" ? `<span class="num" dir="ltr">${esc(p)}</span>` : `<a href="tel:${esc(n)}" class="num" dir="ltr">${esc(p)}</a>`; };
  const items = o.items.map((i) => `<li><bdi>${esc(i.name)}</bdi> <span class="num" dir="ltr">×${numText(i.qty)}</span></li>`).join("") + (numText(o.moreCount) !== "" && o.moreCount > 0 ? `<li class="more num" dir="ltr">+${numText(o.moreCount)}</li>` : "");
  return `<dl class="facts">${fact(t(L, "orders.detail.customer"), o.customerName, (v) => `<bdi>${esc(v)}</bdi>`)}${fact(t(L, "orders.detail.phone"), o.phone, dial)}${fact(t(L, "orders.detail.address"), o.address, (v) => `<bdi>${esc(v)}</bdi>`)}${fact(t(L, "orders.detail.wilaya"), o.wilaya, (v) => `<bdi>${esc(v)}</bdi>`)}`
    + `<div class="fact"><dt>${esc(t(L, "orders.detail.items"))}</dt><dd><ul class="items">${items}</ul></dd></div><div class="fact"><dt>${esc(t(L, "orders.detail.source"))}</dt><dd>${esc(o.source)}</dd></div>`
    + fact(t(L, "orders.detail.total"), o.totalPrice === undefined ? undefined : formatDzd(o.totalPrice, L), (v) => `<span class="total num" dir="auto">${esc(v)}</span>`) + `</dl>`;
}

export function renderOrderDetail(m: OrdersModel): string {
  const L = m.locale; const back = `<button type="button" class="btn btn-ghost back" data-act="back">${esc(t(L, "orders.back"))}</button>`;
  const shell = (inner: string, title: string = t(L, "orders.title")): string => `<section class="orders order" data-screen="order">${back}<h1>${esc(title)}</h1>${renderFreshness(m)}${inner}</section>`;
  const order = m.data?.orders.find((o) => o.id === m.openId);
  if (m.data === null) {
    return m.read === "error"
      ? shell(renderError({ title: t(L, "orders.detail.error"), body: t(L, "orders.error.hint"), retryAct: "orders-retry", retryLabel: t(L, "common.retry") }))
      : shell(renderSkeleton({ rows: 4, label: t(L, "common.loading") }));
  }
  if (!order) return shell(renderEmpty({ body: t(L, "orders.detail.gone") }));

  const error = m.read === "error" ? renderError({ title: t(L, "orders.detail.error"), body: t(L, "orders.error.hint"), retryAct: "orders-retry", retryLabel: t(L, "common.retry") }) : "";
  const changed = changedSinceOpened(m, order);
  const banner = changed ? `<div class="note alert" role="status"><p>${esc(t(L, "orders.detail.changed"))}</p><button type="button" class="btn btn-ghost" data-act="ack-change">${esc(t(L, "orders.detail.ack"))}</button></div>` : "";
  const actionable = isPending(order) && canAct(m);
  const open = openCommandFor(m, order.id);
  const locked = open !== undefined || changed;
  const off = locked ? " disabled" : "";
  const actions = actionable ? `<div class="actions"><button type="button" class="btn btn-primary" data-act="confirm-open"${off}>${esc(t(L, "cmd.confirm"))}</button><button type="button" class="btn btn-ghost" data-act="reject-open"${off}>${esc(t(L, "cmd.reject"))}</button></div>` : "";
  const last = latestCommandFor(m, order.id);
  const chip = last ? renderOrderCommand(last, order, m) : "";
  const notice = m.notice ? `<p class="note alert" role="alert">${esc(t(L, m.notice === "busy" ? "orders.busy" : "orders.error.save"))}</p>` : "";
  const sheet = actionable && !locked && m.sheet
    ? renderConfirmSheet({ mode: m.sheet, number: order.orderNumber, locale: L, ...(order.customerName === undefined ? {} : { customer: order.customerName }), ...(order.totalPrice === undefined ? {} : { total: formatDzd(order.totalPrice, L) }) }) : "";
  const noteCount = order.noteCount > 0 ? `<p class="hint">${esc(t(L, "orders.detail.notes", { n: order.noteCount }))}</p>` : "";
  const notes = renderNotes({
    entityType: "order", entityId: order.id, noteVersion: order.noteVersion, draft: m.draft, locale: L, now: m.now, online: m.online, error: m.noteError, readOnly: !canAct(m),
    notes: m.commands.filter((r) => r.kind === "command.comments.write" && r.target.id === order.id),
    ...(m.authorityExpiresAt === undefined ? {} : { authorityExpiresAt: m.authorityExpiresAt }), ...(m.timeZone ? { timeZone: m.timeZone } : {}),
  });
  const title = t(L, "orders.detail.title", { number: `${LRI}${order.orderNumber}${PDI}` });
  const status = `<p class="status-line"><span class="st st-${isPending(order) ? "pending" : /^[a-z]+$/.test(order.status) ? esc(order.status) : "other"}">${esc(statusLabel(L, order.status))}</span> <span class="age">${esc(ageLabel(order.createdAt, m.now, L))}</span></p>`;
  return shell(`${error}${banner}${status}${renderFacts(order, m)}${noteCount}${actions}${chip}${notice}${sheet}${notes}`, title);
}
