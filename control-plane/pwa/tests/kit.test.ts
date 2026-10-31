// W3-F3 step 5: the shared UI kit (string renderers), the lazy screen registry and the CSS rules the kit promises.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScreen, GROUP_OF } from "../src/app/registry";
import { renderChip } from "../src/kit/command-chip";
import { renderComposer } from "../src/kit/composer";
import { renderConfirmSheet } from "../src/kit/confirm-sheet";
import { renderEmpty } from "../src/kit/empty-block";
import { renderError } from "../src/kit/error-block";
import { renderSkeleton } from "../src/kit/skeleton";
import { renderStateStrip } from "../src/kit/state-strip";
import { t } from "../src/i18n";
import { esc } from "../src/views/view";

const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
const kitCss = css.slice(css.indexOf("/* kit */"));
const lum = (hex: string): number => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0); };
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05); };

describe("state strip", () => {
  const at = Date.UTC(2026, 9, 31, 7, 42);
  it("says 'as of' with the time for a fresh copy, and the PC-off sentence for pcoff", () => {
    expect(renderStateStrip({ state: "fresh", at, locale: "en", timeZone: "UTC" })).toContain(t("en", "state.asof", { time: "07:42" }));
    expect(renderStateStrip({ state: "pcoff", at, locale: "fr", timeZone: "UTC" })).toContain(esc(t("fr", "state.pcoff", { time: "07:42" })));
    expect(renderStateStrip({ state: "stale", at, locale: "en", timeZone: "UTC" })).toContain("07:42");
  });
});
describe("command chip", () => {
  const base = { kind: "command.orders.confirm" as const, resultCode: undefined, lastError: null, nextTryAt: 0 };
  it.each([["queued", "cmd.queued"], ["sent", "cmd.sent"], ["committed", "cmd.committed"], ["failed", "cmd.failed"], ["expired", "cmd.expired"], ["unknown", "cmd.unknown"]] as const)("%s shows %s and nothing says done before the PC did", (state, key) => {
    const html = renderChip({ record: { ...base, state }, locale: "en", now: 0 });
    expect(html).toContain(t("en", key)); expect(html).toContain(`data-state="${state}"`);
    if (state !== "committed") expect(html).not.toContain(t("en", "cmd.committed"));
  });
  it("a committed reply says 'handed to WhatsApp on your PC'; PC-off shows the last-seen time; review and send-anyway come from the code", () => {
    expect(renderChip({ record: { ...base, kind: "command.messages.reply", state: "committed" }, locale: "en", now: 0 })).toContain(t("en", "cmd.replied"));
    expect(renderChip({ record: { ...base, state: "queued", lastError: "waiting_pc" }, locale: "en", now: 0, authorityExpiresAt: Date.UTC(2026, 9, 31, 7, 42), timeZone: "UTC" })).toContain(t("en", "cmd.waitpc", { time: "07:42" }));
    expect(renderChip({ record: { ...base, state: "failed", resultCode: "ORDER_CHANGED" }, locale: "en", now: 0 })).toContain(t("en", "cmd.review"));
    const reply = renderChip({ record: { ...base, kind: "command.messages.reply", state: "failed", resultCode: "ALREADY_ANSWERED" }, locale: "en", now: 0 });
    expect(reply).toContain(t("en", "cmd.answered")); expect(reply).not.toContain("<button"); // a retry could answer twice: no "send anyway"
  });
});
describe("confirm sheet, composer, blocks", () => {
  it("confirm shows number and customer, numbers forced LTR, user text escaped", () => {
    const html = renderConfirmSheet({ mode: "confirm", number: "1042", customer: "<img src=x onerror=1>", total: "35 000 DZD", locale: "ar" });
    expect(html).toContain('dir="ltr"'); expect(html).not.toContain("<img"); expect(html).toContain("&lt;img"); expect(html).toContain('data-act="confirm-yes"');
  });
  it("reject offers exactly the four reasons", () => {
    const html = renderConfirmSheet({ mode: "reject", number: "1042", locale: "en" });
    for (const k of ["customerCancelled", "fakeOrder", "unreachable", "postponed"]) expect(html).toContain(`data-reason="${k}"`);
    expect((html.match(/data-reason=/g) ?? []).length).toBe(4);
  });
  it("composer keeps the draft, escaped, with a label; skeleton is a busy status; empty and error blocks have the right roles", () => {
    expect(renderComposer({ mode: "reply", id: "c1", draft: "a<b", locale: "en" })).toMatch(/<label[^>]*>.*<\/label>[\s\S]*<textarea[^>]*>a&lt;b<\/textarea>/);
    expect(renderSkeleton({ rows: 3, label: "Loading" })).toContain('aria-busy="true"');
    expect(renderEmpty({ body: "Nothing" })).toContain('role="status"'); expect(renderError({ title: "T", body: "B", retryAct: "retry", retryLabel: "Again" })).toContain('role="alert"');
  });
});
describe("kit CSS", () => {
  it("uses logical properties only, 44 px targets, 16 px text", () => {
    expect(kitCss.length).toBeGreaterThan(200);
    expect(kitCss).not.toMatch(/\b(margin|padding)-(left|right)\b|(^|[\s{;])(left|right)\s*:|text-align\s*:\s*(left|right)|border-(left|right)/);
    expect(kitCss).toMatch(/min-block-size:\s*44px/); expect(kitCss).not.toMatch(/font-size:\s*(1[0-5]|[0-9])px/);
  });
  it("Carnet tokens keep 4.5:1 contrast", () => {
    for (const [fg, bg] of [["#15171B", "#FAF7F0"], ["#15171B", "#F3EEE4"], ["#B93A2B", "#FAF7F0"], ["#2D6A4F", "#FAF7F0"]] as const) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
describe("lazy screens", () => {
  it("each group loads from its fixed path and honours the ScreenModule contract", async () => {
    for (const g of ["orders", "inbox", "settings", "install"] as const) {
      const m = await loadScreen(g); expect(typeof m.render).toBe("function"); expect(typeof m.bind).toBe("function");
    }
    expect([GROUP_OF.orders, GROUP_OF.order, GROUP_OF.inbox, GROUP_OF.conversation, GROUP_OF.devices, GROUP_OF.install]).toEqual(["orders", "orders", "inbox", "inbox", "settings", "install"]);
  });
});
