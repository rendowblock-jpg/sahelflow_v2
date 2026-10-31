import { renderStateStrip } from "../kit/state-strip";
import type { Locale } from "../i18n";

// C(4): "your PC is off" on EVERY screen that shows shop data, not on Today only. Today and Orders draw their own strip; any screen
// that already carries a state strip is left alone (no second one). Screens in front of the app have no shop to be off.
const IN_FRONT: ReadonlySet<string> = new Set(["welcome", "pair", "lock", "keygen"]);
const HAS_STRIP = /class="strip[ "]|class="[^"]*\bstate-strip\b/;

export type ShellStripInput = Readonly<{ screen: string; pcoff: boolean; asOf: number | null; locale: Locale; timeZone?: string }>;

/** The pcoff strip for this screen, or "" (PC reachable, a screen in front of the app, or no copy ever received: no time to show). */
export function shellStrip(i: ShellStripInput): string {
  if (!i.pcoff || IN_FRONT.has(i.screen) || i.asOf === null) return "";
  return renderStateStrip({ state: "pcoff", at: i.asOf, locale: i.locale, ...(i.timeZone ? { timeZone: i.timeZone } : {}) });
}

/** The screen's html with the strip put right after <main ...> (or first). Unchanged when the screen already draws a strip. */
export function withShellStrip(html: string, i: ShellStripInput): string {
  const strip = shellStrip(i);
  if (strip === "" || HAS_STRIP.test(html)) return html;
  return /<main\b[^>]*>/.test(html) ? html.replace(/(<main\b[^>]*>)/, `$1${strip}`) : strip + html;
}
