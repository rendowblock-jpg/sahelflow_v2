// W3-F5 step 5: the inbox phone strings (pinned en words, parity with ar/fr) and the style rules, checked on text. Written BEFORE the code.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogs, LOCALES } from "../src/i18n";
import { inboxAr } from "../src/i18n/inbox.ar";
import { inboxEn } from "../src/i18n/inbox.en";
import { inboxFr } from "../src/i18n/inbox.fr";
import { focusKeyOf, restoreFocus } from "../src/views/inbox/glue";

const css = readFileSync(new URL("../src/styles/inbox.css", import.meta.url), "utf8");

describe("inbox strings", () => {
  it("the same keys in ar, fr and en, all starting with inbox.", () => {
    const keys = Object.keys(inboxEn).sort();
    expect(keys.length).toBeGreaterThan(40); expect(Object.keys(inboxAr).sort()).toEqual(keys); expect(Object.keys(inboxFr).sort()).toEqual(keys);
    for (const k of keys) expect(k.startsWith("inbox.")).toBe(true);
  });
  it("the words the brief promises, exactly", () => {
    expect(inboxEn).toMatchObject({
      "inbox.held": "Held on your PC", "inbox.empty": "No conversations to answer", "inbox.window": "Latest {{n}} conversations", "inbox.thread.empty": "No messages yet",
      "inbox.thread.truncated": "Long message: open it on your PC", "inbox.thread.older": "Older messages are on your PC", "inbox.media": "{{kind}}: open on your PC",
      "inbox.outcome.guard": "WhatsApp safety limit reached on your PC. Wait and try later.", "inbox.outcome.denied": "Your role cannot reply from the phone.",
      "inbox.reply.expired": "Your PC did not pick this up in time, so nothing was sent.", "inbox.outcome.expired": "Too late: this was not sent. Send it again if you still want it.",
    });
    expect(catalogs.en["cmd.replied"]).toBe("Handed to WhatsApp on your PC.");
  });
  it("no reply or outcome sentence ever says delivered", () => {
    for (const l of LOCALES) for (const [k, v] of Object.entries(catalogs[l])) if (k.startsWith("inbox.reply.") || k.startsWith("inbox.outcome.") || k === "cmd.replied") expect(v, `${l}:${k}`).not.toMatch(/deliver|livr|تم التسليم|تم التوصيل|وصلت إلى الزبون/i);
  });
});

describe("inbox.css", () => {
  it("logical properties only, one bubble-side property, no sideways scroll", () => {
    expect(css).not.toMatch(/(margin|padding|border)-(left|right)|[^-\w](left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:/);
    expect((css.match(/--bubble-flow/g) ?? []).length).toBeGreaterThanOrEqual(1); expect(css).toMatch(/direction\s*:\s*var\(--bubble-flow/);
    expect(css).toMatch(/overflow-wrap\s*:\s*anywhere/); expect(css).toMatch(/unicode-bidi\s*:\s*isolate/); expect(css).not.toMatch(/overflow-x\s*:\s*(scroll|auto)/);
  });
  it("every text is at least 16 px and every target at least 44 px", () => {
    const sizes = [...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])); expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
    for (const sel of [".inbox .row-main", ".inbox .btn", ".inbox .composer textarea"]) expect(css, sel).toMatch(new RegExp(`${sel.replace(/\./g, "\\.")}[^{]*\\{[^}]*min-block-size:\\s*(4[4-9]|[5-9]\\d)px`));
  });
});

// The redraw glue: the focused control and the caret come back after innerHTML.
type FakeEl = { key: string | null; focused: boolean; selStart: number; selEnd: number; getAttribute(n: string): string | null; focus(): void; setSelectionRange(a: number, b: number): void };
const el = (key: string | null): FakeEl => ({ key, focused: false, selStart: 0, selEnd: 0, getAttribute: (n) => (n === "data-key" ? key : null), focus() { this.focused = true; }, setSelectionRange(a, b) { this.selStart = a; this.selEnd = b; } });
describe("focus survives a redraw", () => {
  it("remembers the data-key and the caret, and puts them back on the new element", () => {
    const old = el("cmp:c1"); const s = focusKeyOf(old as never, { selectionStart: 3, selectionEnd: 5 } as never);
    expect(s).toEqual({ key: "cmp:c1", start: 3, end: 5 });
    const fresh = el("cmp:c1"); const other = el("act:send");
    restoreFocus({ querySelector: (sel: string) => (sel === '[data-key="cmp:c1"]' ? fresh : other) } as never, s);
    expect(fresh.focused).toBe(true); expect(other.focused).toBe(false); expect([fresh.selStart, fresh.selEnd]).toEqual([3, 5]);
  });
  it("does nothing when nothing had focus or the element is gone", () => {
    expect(focusKeyOf(null, null)).toBeNull(); expect(focusKeyOf(el(null) as never, null)).toBeNull();
    expect(() => restoreFocus({ querySelector: () => null } as never, { key: "x", start: 0, end: 0 })).not.toThrow(); expect(() => restoreFocus({ querySelector: () => null } as never, null)).not.toThrow();
  });
});
