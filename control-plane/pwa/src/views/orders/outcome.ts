// W3-F4 step 4: what a command on an order says. The wording comes from F2's result codes; the phone never invents a "done".
import type { OrderProjectionRow } from "../../../../../src/lib/connected-platform/contracts";
import { t } from "../../i18n";
import { renderChip } from "../../kit/command-chip";
import type { OutboxRecord } from "../../outbox/state";
import { esc } from "../view";
import { statusLabel, type OrdersModel } from "./model";

const KEY: Readonly<Record<string, string>> = { ORDER_CHANGED: "orders.outcome.changed", EXPIRED: "orders.outcome.expired", PERMISSION_DENIED: "orders.outcome.denied", NOT_FOUND: "orders.outcome.notfound", ORDER_NOT_CONFIRMABLE_HERE: "orders.outcome.notconfirmable" };
export function renderOrderCommand(r: OutboxRecord, order: OrderProjectionRow | undefined, m: OrdersModel): string {
  const code = r.resultCode;
  const generic = (): string => renderChip({ record: r, locale: m.locale, now: m.now, ...(m.authorityExpiresAt === undefined ? {} : { authorityExpiresAt: m.authorityExpiresAt }), ...(m.timeZone ? { timeZone: m.timeZone } : {}) });
  if (r.state !== "failed" || code === undefined) return generic();
  const key = code.startsWith("ORDER_ALREADY_") ? "orders.outcome.done" : KEY[code];
  if (key === undefined) return generic();
  const text = esc(t(m.locale, key, { status: order ? statusLabel(m.locale, order.status) : "" }));
  // ORDER_CHANGED is never retried: the only action is to look again. EXPIRED needs a deliberate new tap.
  const action = code === "ORDER_CHANGED" ? `<button type="button" class="btn btn-ghost" data-act="order-review">${esc(t(m.locale, "orders.outcome.review"))}</button>`
    : code === "EXPIRED" ? `<button type="button" class="btn btn-ghost" data-act="cmd-retry">${esc(t(m.locale, "cmd.retry"))}</button>` : "";
  const tone = key === "orders.outcome.done" ? "chip-neutral" : "chip-failed";
  return `<div class="chip ${tone}" role="status" data-state="failed" data-code="${esc(code)}"><span>${text}</span>${action}</div>`;
}
