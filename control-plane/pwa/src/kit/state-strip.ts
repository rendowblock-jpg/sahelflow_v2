import { formatTime, t, type Locale } from "../i18n";
import { esc } from "../views/view";

export type StripState = "fresh" | "stale" | "expired" | "pcoff" | "offline";
// "As of 07:42" for a fresh copy; an honest sentence for an old one or for a PC that is off.
export function renderStateStrip(i: Readonly<{ state: StripState; at: number; locale: Locale; timeZone?: string }>): string {
  const time = formatTime(i.at, i.locale, i.timeZone);
  const key = i.state === "pcoff" ? "state.pcoff" : i.state === "fresh" ? "state.asof" : "state.stale";
  return `<div class="strip state-strip" role="status" data-state="${i.state}"><strong>${esc(t(i.locale, key, { time }))}</strong></div>`;
}
