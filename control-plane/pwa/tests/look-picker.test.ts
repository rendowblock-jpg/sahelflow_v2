// The look picker in Settings: four choices, one pressed, saved under sf.look, a bad saved value means the default look.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, LOOK_KEY, LOOKS, parseLook } from "../src/look";
import { renderSettings } from "../src/views/settings/render";
import { renderApp, type View } from "../src/views/view";
import { catalogs } from "../src/i18n";

const model = (look: "sahel" | "atlas" | "oasis" | "dune", locale: "ar" | "fr" | "en" = "fr") => ({
  locale, theme: "system" as const, look, online: true, hasLock: false, read: { status: "ready" as const, asOf: 0, pairedAt: 0, commands: [] },
  confirmRemove: false, removeError: false, removed: false,
});

describe("look.ts", () => {
  it("the four looks of the desktop, Sahel first and the default", () => { expect([...LOOKS]).toEqual(["sahel", "atlas", "oasis", "dune"]); expect(DEFAULT_LOOK).toBe("sahel"); expect(LOOK_KEY).toBe("sf.look"); });
  it("parseLook: anything that is not one of the four is the default (an old saved value, null, a typed value)", () => {
    for (const bad of [null, undefined, "", "carnet", "ATLAS", "pink", 3]) expect(parseLook(bad)).toBe("sahel");
    for (const ok of LOOKS) expect(parseLook(ok)).toBe(ok);
  });
});
describe("Settings shows the picker", () => {
  for (const locale of ["ar", "fr", "en"] as const) {
    it(`${locale}: 4 buttons named like the desktop, only the chosen one pressed`, () => {
      for (const chosen of LOOKS) {
        const h = renderSettings(model(chosen, locale));
        const buttons = [...h.matchAll(/<button type="button" class="seg" data-act="s-look" data-s-look="(\w+)" aria-pressed="(true|false)">([^<]*)<\/button>/g)];
        expect(buttons.map((b) => b[1])).toEqual([...LOOKS]);
        expect(buttons.filter((b) => b[2] === "true").map((b) => b[1])).toEqual([chosen]);
        for (const b of buttons) expect(b[3], `${locale} ${b[1]}`).toBe(catalogs[locale][`settings.look.${b[1]}`]);
        expect(h).toContain(`<h2 id="s-y">${catalogs[locale]["settings.look"]}</h2>`);
      }
    });
  }
  it("the four looks sit two by two in a grid, in both Settings templates (a flex row left Dune alone on a second line)", () => {
    const shell = renderApp({ locale: "fr", theme: "system", look: "sahel", screen: "settings", state: "ready", now: 0, online: true, updateReady: false, canInstall: false, installed: false, ios: false,
      projection: null, step: null, fingerprint: null, failure: null, lockMode: "enter", lockNotice: null, hasLock: false, version: "0.1.0", confirmRemove: false, removeError: null, removed: false } as unknown as View);
    for (const h of [renderSettings(model("sahel")), shell]) expect(h).toContain('<div class="segs segs-grid" role="group" aria-labelledby="s-y">');
    const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.segs-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
    expect(css).toMatch(/\.segs-grid \.seg\{justify-content:center\}/);
  });
  it("the desktop's words: Color style / Style de couleur / نمط الألوان and الساحل الأطلس الواحة الكثبان", () => {
    expect(catalogs.en["settings.look"]).toBe("Color style"); expect(catalogs.fr["settings.look"]).toBe("Style de couleur"); expect(catalogs.ar["settings.look"]).toBe("نمط الألوان");
    expect(LOOKS.map((l) => catalogs.ar[`settings.look.${l}`])).toEqual(["الساحل", "الأطلس", "الواحة", "الكثبان"]);
    expect(LOOKS.map((l) => catalogs.fr[`settings.look.${l}`])).toEqual(["Sahel", "Atlas", "Oasis", "Dune"]);
  });
  it("a phone that is not paired yet gets the same picker from the shell (data-look buttons)", () => {
    const v = { locale: "fr", theme: "system", look: "oasis", screen: "settings", state: "ready", now: 0, online: true, updateReady: false, canInstall: false, installed: false, ios: false,
      projection: null, step: null, fingerprint: null, failure: null, lockMode: "enter", lockNotice: null, hasLock: false, version: "0.1.0", confirmRemove: false, removeError: null, removed: false } as unknown as View;
    const h = renderApp(v);
    expect([...h.matchAll(/data-look="(\w+)" aria-pressed="(true|false)"/g)].map((m) => `${m[1]}:${m[2]}`)).toEqual(["sahel:false", "atlas:false", "oasis:true", "dune:false"]);
  });
});
