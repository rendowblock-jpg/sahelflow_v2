// @vitest-environment happy-dom
// W3b F6c: the joins that make the orders, inbox, devices and install screens REACHABLE. app.ts has no DOM test, so its source is read;
// renderApp is parsed for real (tabs, aria-current, placeholder main, lock and revoked win).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GROUP_OF } from "../src/app/registry";
import { effectiveScreen, renderApp, type ScreenId, type View } from "../src/views/view";

// happy-dom replaces URL, so the path is built from the plain import.meta.url string.
const app = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/app/app.ts"), "utf8");
const count = (re: RegExp): number => (app.match(re) ?? []).length;
const V: View = {
  locale: "en", theme: "system", screen: "today", state: "empty", now: 0, online: true, updateReady: false, canInstall: false, installed: false, ios: false,
  projection: null, step: null, fingerprint: null, failure: null, lockMode: "enter", lockNotice: null, hasLock: false, version: "1", confirmRemove: false, removeError: null, removed: false,
};
const draw = (v: View): Document => { document.body.innerHTML = renderApp(v); return document; };
const tabs = (d: Document): string[] => Array.from(d.querySelectorAll("nav.tabs a")).map((a) => a.getAttribute("data-nav") ?? "");
const current = (d: Document): string[] => Array.from(d.querySelectorAll("nav.tabs a[aria-current=page]")).map((a) => a.getAttribute("data-nav") ?? "");

describe("app.ts joins", () => {
  it("imports createScreenMount once, builds one mount, shows it from paint and disposes before the page is replaced", () => {
    expect(count(/import \{ createScreenMount \} from "\.\/screen-mount"/g)).toBe(1);
    expect(count(/createScreenMount\(/g)).toBe(1);
    expect(app).toMatch(/screenMount\.dispose\(\);[\s\S]{0,400}root\.innerHTML = withShellStrip\(renderApp\(v\)/);
    expect(count(/screenMount\.show\(/g)).toBeGreaterThanOrEqual(1);
  });
  it("SCREENS holds the six lazy ids and every GROUP_OF id", () => {
    const line = app.match(/const SCREENS[^\n]*/)?.[0] ?? "";
    for (const id of ["orders", "order", "inbox", "conversation", "devices", "install", "welcome", "pair", "today", "settings", "lock"]) expect(line, id).toContain(`"${id}"`);
    for (const id of Object.keys(GROUP_OF)) expect(line, id).toContain(`"${id}"`);
  });
});

describe("tabs and the placeholder main", () => {
  it("a paired phone: Today, Orders, Inbox, Settings; aria-current follows the lazy ids", () => {
    const want: Array<[ScreenId, string]> = [["today", "today"], ["orders", "orders"], ["order", "orders"], ["inbox", "inbox"], ["conversation", "inbox"], ["devices", "settings"], ["settings", "settings"]];
    for (const [screen, tab] of want) { const d = draw({ ...V, paired: true, screen }); expect(tabs(d), screen).toEqual(["today", "orders", "inbox", "settings"]); expect(current(d), screen).toEqual([tab]); }
  });
  it("an unpaired phone keeps Today, Pairing, Settings and cannot reach Orders or Inbox", () => {
    expect(tabs(draw({ ...V, screen: "today" }))).toEqual(["today", "pair", "settings"]);
    expect(effectiveScreen({ ...V, screen: "orders" })).toBe("today"); expect(effectiveScreen({ ...V, screen: "conversation" })).toBe("today");
    expect(effectiveScreen({ ...V, screen: "devices" })).toBe("devices"); expect(effectiveScreen({ ...V, screen: "install" })).toBe("install");
    expect(effectiveScreen({ ...V, paired: true, screen: "settings" })).toBe("devices");
    expect(effectiveScreen({ ...V, paired: true, revoked: true, screen: "settings" })).toBe("settings");
  });
  it("a lazy screen gets one empty <main id=main> for the mount; there is no second page chrome", () => {
    const d = draw({ ...V, paired: true, screen: "orders" });
    expect(d.querySelectorAll("main").length).toBe(1); expect(d.querySelector("main")?.id).toBe("main"); expect(d.querySelector("main")?.innerHTML).toBe("");
    expect(d.querySelectorAll("header.top").length).toBe(1); expect(d.querySelectorAll("nav.tabs").length).toBe(1);
  });
  it("the lock screen and the revoked state win over the lazy screens", () => {
    const l = draw({ ...V, paired: true, screen: "lock" }); expect(l.querySelector("nav.tabs")).toBeNull(); expect(l.querySelector("#pin")).not.toBeNull();
    const r = draw({ ...V, paired: true, revoked: true, screen: "settings" }); expect(r.querySelector("main")?.innerHTML).toContain("alert");
  });
});
