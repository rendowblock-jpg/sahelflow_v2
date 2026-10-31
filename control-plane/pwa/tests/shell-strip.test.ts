// W3-F3 round 3d, C(4): pcoff strip on every screen with shop data, once, never in front of the app.
import { describe, expect, it } from "vitest";
import { shellStrip, withShellStrip } from "../src/app/shell-strip";

const base = { pcoff: true, asOf: Date.UTC(2026, 9, 31, 7, 42), locale: "en" as const, timeZone: "UTC" };
const SCREENS = ["today", "orders", "order", "inbox", "conversation", "settings", "devices", "install"];

describe("shell strip (pcoff)", () => {
  it.each(SCREENS)("%s gets the pcoff strip with the PC time", (screen) => {
    const s = shellStrip({ ...base, screen });
    expect(s).toContain('data-state="pcoff"'); expect(s).toMatch(/0?7:42/); expect(s).toContain("Your PC is off");
  });
  it.each(["welcome", "pair", "lock", "keygen"])("%s (in front of the app) gets none", (screen) => { expect(shellStrip({ ...base, screen })).toBe(""); });
  it("none when the PC is reachable, and none when no copy was ever received", () => {
    expect(shellStrip({ ...base, screen: "settings", pcoff: false })).toBe("");
    expect(shellStrip({ ...base, screen: "settings", asOf: null })).toBe("");
  });
  it("is put right after <main>, or first when there is no main", () => {
    const out = withShellStrip('<header>h</header><main id="main" tabindex="-1"><h1>x</h1></main>', { ...base, screen: "settings" });
    expect(out).toMatch(/<main id="main" tabindex="-1"><div class="strip state-strip"/); expect(out.match(/state-strip/g)?.length).toBe(1);
    expect(withShellStrip("<p>x</p>", { ...base, screen: "install" }).startsWith('<div class="strip state-strip"')).toBe(true);
  });
  it("a screen that already draws a state strip or the Today pcoff strip gets no second one", () => {
    const own = '<main><div class="strip state-strip" role="status" data-state="pcoff">own</div></main>';
    expect(withShellStrip(own, { ...base, screen: "orders" })).toBe(own);
    const today = '<main><div class="strip pcoff-strip" role="status">today</div></main>';
    expect(withShellStrip(today, { ...base, screen: "today" })).toBe(today);
  });
});
