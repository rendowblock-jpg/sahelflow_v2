import { t, type Locale } from "../i18n";
import { REJECT_REASON_KEYS } from "../../../../src/lib/connected-platform/contracts";
import { esc } from "../views/view";

const LRI = "\u2066"; const PDI = "\u2069";
// ONE decision per sheet: order number, customer, total (only when the role may see it); numbers stay left-to-right inside Arabic.
export function renderConfirmSheet(i: Readonly<{ mode: "confirm" | "reject"; number: string; customer?: string; total?: string; locale: Locale }>): string {
  const title = esc(t(i.locale, i.mode === "confirm" ? "cmd.confirm.title" : "cmd.reject.title", { number: `${LRI}${i.number}${PDI}` }));
  const who = i.customer ? `<p class="who"><bdi>${esc(i.customer)}</bdi></p>` : "";
  const total = i.total ? `<p class="total num" dir="ltr">${esc(i.total)}</p>` : "";
  const number = `<p class="num" dir="ltr">${esc(i.number)}</p>`;
  const body = i.mode === "confirm"
    ? `<button type="button" class="btn btn-primary" data-act="confirm-yes">${esc(t(i.locale, "cmd.confirm"))}</button>`
    : REJECT_REASON_KEYS.map((k) => `<button type="button" class="btn btn-ghost" data-act="reject-yes" data-reason="${k}">${esc(t(i.locale, `cmd.reason.${k}`))}</button>`).join("");
  return `<div class="sheet confirm" role="dialog" aria-modal="true" aria-labelledby="cs-t"><h2 id="cs-t">${title}</h2>${number}${who}${total}<div class="actions">${body}<button type="button" class="btn btn-ghost" data-act="sheet-cancel">${esc(t(i.locale, "cmd.cancel"))}</button></div></div>`;
}
