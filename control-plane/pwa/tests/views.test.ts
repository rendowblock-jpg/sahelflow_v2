import { describe, expect, it } from "vitest";
import { LOCALES, catalogs, formatDzd, formatTime, type Locale } from "../src/i18n";
import { applyPreview, fixtureProjection } from "../src/app/preview";
import { esc, renderApp, type ScreenId, type View, type ViewState } from "../src/views/view";

const NOW = Date.UTC(2026, 9, 30, 12, 0);
const base = (locale: Locale): View => ({
  locale, theme: "system", screen: "welcome", state: "empty", now: NOW, online: true, updateReady: false, canInstall: false, installed: false, ios: false,
  projection: null, step: null, fingerprint: null, failure: null, lockMode: "enter", lockNotice: null, hasLock: false,
  version: "0.1.0", confirmRemove: false, removeError: null, removed: false,
});
const SCREENS: readonly ScreenId[] = ["welcome", "pair", "today", "settings", "lock"];
const STATES: readonly ViewState[] = ["loading", "empty", "error", "stale", "offline", "ready", "expired", "keygen", "waiting"];
const render = (locale: Locale, screen: ScreenId, state: ViewState, extra = ""): string => renderApp(applyPreview(base(locale), `?screen=${screen}&state=${state}${extra}`));

describe("every screen x state x language renders safely", () => {
  for (const locale of LOCALES) for (const screen of SCREENS) for (const state of STATES) {
    it(`${locale}/${screen}/${state}`, () => {
      const html = render(locale, screen, state);
      expect(html.length).toBeGreaterThan(80);
      expect(html).not.toMatch(/\sstyle=/);
      expect(html).not.toMatch(/<script|javascript:|\son[a-z]+=/i);
      expect(html).not.toContain("{{");
      expect(html.match(/<h1[ >]/g)?.length).toBe(1);
      expect(html).not.toMatch(/<button[^>]*>\s*<\/button>/);
      expect(html).not.toMatch(/undefined|\[object/);
    });
  }
});

describe("Today", () => {
  it("shows integers as DZD, seven bars, and a text alternative with the numbers", () => {
    const html = render("fr", "today", "ready");
    expect(html).toContain(formatDzd(187_500, "fr"));
    expect(html.match(/<li class="b\d+"/g)?.length).toBe(7);
    expect(html).toMatch(/role="img" aria-label="[^"]*3, 5, 2, 8, 6, 4, 9"/);
  });
  it("stale and offline name the age; expired hides the numbers", () => {
    const stale = render("en", "today", "stale");
    expect(stale).toContain(formatTime(NOW - 3 * 3_600_000, "en"));
    expect(render("en", "today", "offline")).toContain("banner");
    const expired = render("en", "today", "expired");
    expect(expired).not.toContain("187");
    expect(expired).toContain(catalogs.en["today.expired"]);
  });
  it("without data it says the phone is not paired, with zero data it says no orders", () => {
    expect(renderApp({ ...base("en"), screen: "today", state: "empty" })).toContain(catalogs.en["today.notpaired"]);
    expect(render("en", "today", "empty")).toContain(catalogs.en["today.empty"]);
  });
  it("uses the red margin only for the card that needs the seller's call", () => {
    for (const locale of LOCALES) for (const screen of SCREENS) for (const state of STATES) {
      const html = render(locale, screen, state);
      const n = html.match(/class="note margin"/g)?.length ?? 0;
      const allowed = (screen === "today" && (state === "ready" || state === "stale" || state === "offline")) || (screen === "pair" && state === "waiting");
      expect(n, `${locale}/${screen}/${state}`).toBe(allowed ? 1 : 0);
    }
  });
  it("a zero to-confirm count shows no call card", () => {
    const p = { ...fixtureProjection(NOW, 60_000), toConfirm: 0 };
    expect(renderApp({ ...base("ar"), screen: "today", state: "ready", projection: p })).not.toContain("note margin");
  });
});

describe("other screens", () => {
  it("welcome: install button, iOS card, installed stamp", () => {
    expect(render("en", "welcome", "ready")).toContain('data-act="install"');
    const ios = render("en", "welcome", "ready", "&ios=1");
    expect(ios).toContain("Share");
    expect(ios).not.toContain('data-act="install"');
    expect(renderApp({ ...base("fr"), installed: true })).toContain("stamp-ok");
  });
  it("welcome stale shows the update banner with a button, offline the offline banner", () => {
    expect(render("ar", "welcome", "stale")).toContain('data-act="update"');
    expect(render("ar", "welcome", "offline")).toContain(esc(catalogs.ar["common.offline"] ?? ""));
  });
  it("pair: shows the 4-group fingerprint left-to-right and waits for the PC", () => {
    const html = render("ar", "pair", "waiting");
    expect(html).toContain('dir="ltr">A1B2-C3D4-E5F6-7788');
    expect(html).toContain(catalogs.ar["pair.waiting"]);
    expect(render("en", "pair", "keygen")).toContain("<progress");
  });
  it("escapes anything that reaches the page", () => {
    const html = renderApp({ ...base("en"), screen: "pair", state: "waiting", fingerprint: '"><img src=x onerror=alert(1)>' });
    expect(html).not.toContain("<img");
    expect(esc("<&>\"'")).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
  it("settings: language and theme buttons say which one is on; remove asks twice", () => {
    const html = renderApp({ ...base("fr"), screen: "settings", theme: "dark" });
    expect(html).toContain('data-lang="fr" aria-pressed="true"');
    expect(html).toContain('data-theme="dark" aria-pressed="true"');
    expect(html).toContain('data-act="remove"');
    expect(html).not.toContain('data-act="remove-yes"');
    expect(renderApp({ ...base("fr"), screen: "settings", confirmRemove: true })).toContain('data-act="remove-yes"');
  });
  it("lock: an 8-digit labelled password field, never a plain text field", () => {
    const html = render("en", "lock", "ready");
    expect(html).toMatch(/<label for="pin">/);
    expect(html).toMatch(/id="pin"[^>]*type="password"[^>]*inputmode="numeric"[^>]*maxlength="8"/);
  });
});
