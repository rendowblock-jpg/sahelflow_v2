// W3-F4 step 1: the orders list as a string (the screen file draws it; tests read it).
import type { OrderProjectionRow } from "../../../../../src/lib/connected-platform/contracts";
import { formatDzd, t } from "../../i18n";
import { renderEmpty } from "../../kit/empty-block";
import { renderError } from "../../kit/error-block";
import { renderSkeleton } from "../../kit/skeleton";
import { renderStateStrip } from "../../kit/state-strip";
import { esc, numText } from "../view";
import { FILTERS, ageLabel, filterOrders, freshnessOf, isPending, listChip, statusLabel, type OrdersModel } from "./model";
import { renderOrderCommand } from "./outcome";

// The offline banner and the age strip, shared with the detail.
export function renderFreshness(m: OrdersModel): string {
  const f = freshnessOf(m);
  const banner = m.online ? "" : `<div class="banner" role="status">${esc(t(m.locale, "common.offline"))}</div>`;
  if (f === "none" || m.asOf === null) return banner;
  const strip = f === "expired"
    ? `<div class="strip state-strip" role="status" data-state="expired"><strong>${esc(t(m.locale, "orders.state.expired"))}</strong></div>`
    : renderStateStrip({ state: f, at: m.asOf, locale: m.locale, ...(m.timeZone ? { timeZone: m.timeZone } : {}) });
  return banner + strip;
}

function renderRow(o: OrderProjectionRow, m: OrdersModel): string {
  const L = m.locale; const id = esc(o.id); const first = o.items[0];
  const extra = Math.max(0, o.items.length - 1) + (typeof o.moreCount === "number" && Number.isFinite(o.moreCount) ? o.moreCount : 0);
  const what = first ? `<span class="what"><bdi>${esc(first.name)}</bdi> <span class="num" dir="ltr">×${numText(first.qty)}</span>${extra > 0 ? ` <span class="more num" dir="ltr">+${extra}</span>` : ""}</span>` : "";
  // A total the role may not see is absent from the row: nothing is drawn (the detail says "Hidden for your role").
  const total = o.totalPrice === undefined ? "" : `<span class="total num" dir="auto">${esc(formatDzd(o.totalPrice, L))}</span>`;
  const rec = listChip(m, o);
  return `<li class="row" data-id="${id}"><button type="button" class="row-main" data-act="open-order" data-id="${id}" aria-label="${esc(t(L, "orders.open", { number: o.orderNumber }))}"><span class="num ord" dir="ltr">${esc(o.orderNumber)}</span><span class="st st-${isPending(o) ? "pending" : /^[a-z]+$/.test(o.status) ? esc(o.status) : "other"}">${esc(statusLabel(L, o.status))}</span>${what}${total}<span class="age">${esc(ageLabel(o.createdAt, m.now, L))}</span></button>${rec ? renderOrderCommand(rec, o, m) : ""}</li>`;
}

function windowNote(m: OrdersModel): string {
  const w = m.data?.window; if (!w) return "";
  if (m.filter === "confirm") {
    const shown = (m.data?.orders ?? []).filter(isPending).length;
    return w.pendingTotal > shown ? `<p class="hint window" role="status">${esc(t(m.locale, "orders.window", { shown, total: w.pendingTotal }))}</p>` : "";
  }
  return w.truncated ? `<p class="hint window" role="status">${esc(t(m.locale, "orders.window.all", { shown: w.shown }))}</p>` : "";
}

export function renderOrdersList(m: OrdersModel): string {
  const L = m.locale;
  const filters = `<div class="filters" role="group" aria-label="${esc(t(L, "orders.filters"))}">${FILTERS.map((f) => `<button type="button" class="filter" data-act="filter" data-filter="${f}" aria-pressed="${f === m.filter}">${esc(t(L, `orders.filter.${f}`))}</button>`).join("")}</div>`;
  const head = `<h1>${esc(t(L, "orders.title"))}</h1>${renderFreshness(m)}${filters}`;
  const loading = m.data === null && m.read !== "error";
  if (loading) return `<section class="orders" data-screen="orders">${head}${renderSkeleton({ rows: 6, label: t(L, "common.loading") })}</section>`;
  const error = m.read === "error" ? renderError({ title: t(L, "orders.error.read"), body: t(L, "orders.error.hint"), retryAct: "orders-retry", retryLabel: t(L, "common.retry") }) : "";
  const rows = filterOrders(m);
  const notice = m.notice ? `<p class="note alert" role="alert">${esc(t(L, m.notice === "busy" ? "orders.busy" : "orders.error.save"))}</p>` : "";
  let body = "";
  if (m.data !== null) {
    body = rows.length > 0 ? `<ul class="rows">${rows.map((o) => renderRow(o, m)).join("")}</ul>`
      : renderEmpty({ body: t(L, m.filter === "confirm" ? "orders.empty.confirm" : m.filter === "today" && (m.data.orders.length > 0) ? "orders.empty.today" : "orders.empty.all") });
  }
  return `<section class="orders" data-screen="orders">${head}${error}${notice}${windowNote(m)}${body}</section>`;
}
