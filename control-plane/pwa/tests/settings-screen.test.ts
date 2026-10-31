// W3b F6b: the settings / devices screen: states, escaping, the honest PIN line, remove flow, the screen module without a host.
import { describe, expect, it } from "vitest";
import { catalogs } from "../src/i18n";
import { createSettingsController, type SettingsHost } from "../src/views/settings/controller";
import type { SettingsRead } from "../src/views/settings/render";
import { attachSettingsHost, screen } from "../src/views/settings/screen";
import { NOW, rec } from "./orders-fixtures";

function mk(read: SettingsRead, o: { online?: boolean; remove?: () => Promise<boolean> } = {}) {
  const log: string[] = [];
  const host: SettingsHost = {
    now: () => NOW, locale: () => "en", online: () => o.online ?? true, timeZone: "UTC", theme: () => "system", hasLock: () => false, read: () => read,
    reload: async () => { log.push("reload"); }, retry: async (id) => { log.push(`retry:${id}`); }, discard: async (id) => { log.push(`discard:${id}`); },
    setLocale: (l) => { log.push(`lang:${l}`); }, setTheme: (x) => { log.push(`theme:${x}`); }, startLockSetup: () => { log.push("lock"); },
    remove: o.remove ?? (async () => true), subscribe: () => () => undefined,
  };
  return { host, log, c: createSettingsController(host) };
}
const ready = (commands = [rec({ commandId: "q1", state: "queued", labelForUi: "Confirm SF-1042" })]): SettingsRead => ({ status: "ready", asOf: NOW - 3 * 3_600_000, pairedAt: NOW - 86_400_000 * 5, commands });

describe("settings screen: states", () => {
  it("ready: last update from the sealed copy (never now), paired since, the honest PIN line, language, theme, lock, remove", () => {
    const h = mk(ready()).c.html();
    expect(h).toContain("Last update"); expect(h).toContain("07:00"); expect(h).not.toContain("10:00");
    expect(h).toContain("Paired since"); expect(h).toContain("The PIN only locks the screen. It does not encrypt your data.");
    for (const a of ['data-s-lang="ar"', 'data-s-lang="fr"', 'data-s-lang="en"', 'data-s-theme="dark"', 'data-act="s-lock-set"', 'data-act="s-remove"']) expect(h).toContain(a);
    expect(h).not.toMatch(/deliver/i);
  });
  it("loading is a skeleton with no controls; revoked says it and offers nothing", () => {
    const l = mk({ status: "loading" }).c.html(); expect(l).toContain('data-state="loading"'); expect(l).not.toContain("data-act");
    const r = mk({ status: "revoked" }).c.html(); expect(r).toContain("This phone was removed from your PC"); expect(r).not.toContain("data-act");
  });
  it("error keeps lock, language and remove usable and offers a reload", () => {
    const h = mk({ status: "error" }).c.html();
    expect(h).toContain("could not be loaded"); expect(h).toContain('data-act="s-reload"'); expect(h).toContain('data-act="s-lock-set"'); expect(h).toContain('data-act="s-remove"'); expect(h).toContain('data-s-lang="fr"');
  });
  it("offline: a notice, lock/language/remove usable, Retry disabled, Discard still works", () => {
    const h = mk(ready(), { online: false }).c.html();
    expect(h).toContain('data-state="offline"'); expect(h).toContain("No connection");
    expect(h).toMatch(/data-act="s-retry" disabled/); expect(h).not.toMatch(/data-act="s-discard" disabled/); expect(h).toContain('data-act="s-remove"');
  });
  it("commands: Retry and Discard on a queued one; no button on an ALREADY_ANSWERED reply or on a sent one; everything escaped", () => {
    const h = mk(ready([
      rec({ commandId: "a", state: "queued", labelForUi: "<img src=x onerror=alert(1)>" }), rec({ commandId: "b", state: "unknown", resultCode: "ALREADY_ANSWERED", labelForUi: "answered" }),
      rec({ commandId: "c", state: "sent", labelForUi: "sent one" }),
    ])).c.html();
    expect(h).not.toContain("<img"); expect(h).toContain("&lt;img");
    const rows = h.split("<li ").slice(1).map((row) => row.split("</li>")[0] ?? row); // one row each: the last split piece would run on to the rest of the page
    expect(rows[0]).toContain("s-retry"); expect(rows[0]).toContain("s-discard");
    expect(rows[1]).not.toContain("<button"); expect(rows[2]).not.toContain("<button");
  });
});

describe("settings screen: acts", () => {
  it("remove asks first, cancel closes, yes wipes; a failed or throwing wipe says settings.error.wipe; a good one says removed", async () => {
    const a = mk(ready()); await a.c.act("s-remove", {}); expect(a.c.html()).toContain("alertdialog");
    await a.c.act("s-remove-no", {}); expect(a.c.html()).not.toContain("alertdialog");
    for (const remove of [async () => false, async () => { throw new Error("x"); }]) {
      const b = mk(ready(), { remove }); await b.c.act("s-remove", {}); await b.c.act("s-remove-yes", {});
      expect(b.c.html()).toContain("could not be removed completely");
    }
    const ok = mk(ready()); await ok.c.act("s-remove-yes", {}); expect(ok.c.html()).toContain("This phone was removed.");
  });
  it("language, theme, retry and discard reach the host; junk is ignored", async () => {
    const x = mk(ready());
    await x.c.act("s-lang", { lang: "fr" }); await x.c.act("s-lang", { lang: "de" }); await x.c.act("s-theme", { theme: "dark" }); await x.c.act("s-theme", { theme: "pink" });
    await x.c.act("s-retry", { id: "q1" }); await x.c.act("s-discard", { id: "q1" }); await x.c.act("s-retry", {}); await x.c.act("retry", { id: "q1" });
    expect(x.log).toEqual(["lang:fr", "theme:dark", "retry:q1", "discard:q1"]);
  });
  it("the app's own acts (retry, remove, lang) are never reused: every act here starts with s-", () => {
    const acts = Array.from(mk(ready()).c.html().matchAll(/data-act="([^"]+)"/g)).map((m) => m[1]);
    expect(acts.length).toBeGreaterThan(5); for (const a of acts) expect(a).toMatch(/^s-/);
  });
});

describe("settings screen: the module and the catalogs", () => {
  it("without a host it draws a skeleton; with one it draws the controller", () => {
    attachSettingsHost(null);
    const view = { locale: "en" } as never;
    expect(screen.render({ view, go: () => undefined })).toContain('data-state="loading"');
    attachSettingsHost(mk(ready()).host);
    expect(screen.render({ view, go: () => undefined })).toContain("Last update"); attachSettingsHost(null);
  });
  it("no phone catalog says the PIN encrypts; each one says it only locks", () => {
    for (const l of ["ar", "fr", "en"] as const) {
      for (const [key, v] of Object.entries(catalogs[l])) {
        if (/encrypt|chiffre(?!s)|chiffr(?:ement|é)|تشفير|يشفّر/i.test(v) && /\bPIN\b|\bcode\b|الرمز|رمز/i.test(v)) // "chiffres" is "digits" in French, not "encrypt"
          expect(v, `${l}:${key}`).toMatch(/not |ne |pas|لا |ولا/i);
      }
      expect(catalogs[l]["settings.pinNote"], l).toBeTruthy();
    }
    expect(catalogs.en["settings.pinNote"]).toBe("The PIN only locks the screen. It does not encrypt your data.");
  });
});
