import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRESET,
  PRESET_KEY,
  PRESETS,
  appearanceBootstrapScript,
  parsePreset,
  resolvePreset,
  type PresetInput,
} from "../preset";

/*
 * Which colour preset a person sees. One source of truth for the server layout, the inline script that runs
 * before first paint, and the ThemeProvider. The cream "Carnet" look was removed: an install that saved it
 * (every install did, through the old one-time migration) must come back on a preset that still exists.
 */

type Row = [name: string, input: PresetInput, preset: string];

const TABLE: Row[] = [
  ["new install: nothing stored", {}, "sahel"],
  ["null inputs equal missing inputs", { presetCookie: null, presetStorage: null }, "sahel"],
  ["cookie dune", { presetCookie: "dune" }, "dune"],
  ["storage atlas only (cookie missing)", { presetStorage: "atlas" }, "atlas"],
  ["cookie wins over storage when both are valid", { presetCookie: "atlas", presetStorage: "dune" }, "atlas"],
  ["invalid cookie falls through to valid storage", { presetCookie: "sepia", presetStorage: "oasis" }, "oasis"],
  ["invalid everywhere: the default", { presetCookie: "sepia", presetStorage: "Dune" }, "sahel"],
  ["names are case sensitive", { presetCookie: "Oasis" }, "sahel"],
  ["the removed carnet look in the cookie goes back to the default", { presetCookie: "carnet" }, "sahel"],
  ["the removed carnet look in storage goes back to the default", { presetStorage: "carnet" }, "sahel"],
  ["carnet in the cookie, a real preset in storage: storage decides", { presetCookie: "carnet", presetStorage: "oasis" }, "oasis"],
];

describe("preset: the pure decision", () => {
  it("offers the four presets, Sahel first and the default", () => {
    expect([...PRESETS]).toEqual(["sahel", "atlas", "oasis", "dune"]);
    expect(DEFAULT_PRESET).toBe("sahel");
    expect(PRESET_KEY).toBe("sahelflow-theme-preset");
  });

  it("validates preset names exactly", () => {
    for (const preset of PRESETS) expect(parsePreset(preset)).toBe(preset);
    for (const bad of ["", "carnet", "CARNET", "ledger", "sepia", " sahel", undefined, null]) {
      expect(parsePreset(bad)).toBeNull();
    }
  });

  it.each(TABLE)("%s", (_name, input, preset) => {
    expect(resolvePreset(input)).toBe(preset);
  });
});

type Env = { storage?: Record<string, string>; blocked?: boolean; dark?: boolean };

/** Run the generated inline script in a bare context and read what it applied to <html>. */
function applied(script: string, env: Env = {}) {
  const dataset: Record<string, string> = {};
  const classes = new Set<string>();
  const style: Record<string, string> = {};
  const documentElement = {
    classList: {
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      add: (name: string) => void classes.add(name),
    },
    dataset,
    style,
  };
  const sandbox = {
    document: { documentElement },
    window: { matchMedia: () => ({ matches: env.dark ?? true }) },
    localStorage: {
      getItem: (key: string) => {
        if (env.blocked) throw new Error("storage blocked");
        return env.storage?.[key] ?? null;
      },
    },
  };
  runInNewContext(script, sandbox);
  return { preset: dataset.themePreset, mode: dataset.colorMode, classes: [...classes] };
}

describe("preset: the inline bootstrap script cannot disagree with the function", () => {
  const script = (input: PresetInput, theme = "dark", hasThemeCookie = true) =>
    appearanceBootstrapScript({ theme, hasThemeCookie, presetCookie: input.presetCookie ?? undefined });

  it("carries the same preset list as the source of truth and no migration marker", () => {
    const text = script({});
    expect(text).toContain(JSON.stringify(PRESETS));
    expect(text).not.toContain("carnet");
    expect(text).not.toContain("sahelflow-look");
  });

  it.each(TABLE)("%s (script)", (_name, input, preset) => {
    const storage: Record<string, string> = {};
    if (typeof input.presetStorage === "string") storage[PRESET_KEY] = input.presetStorage;
    expect(applied(script(input), { storage }).preset).toBe(preset);
  });

  it("an old marker left in storage by the removed migration changes nothing", () => {
    const storage = { "sahelflow-look": "2", [PRESET_KEY]: "dune" };
    expect(applied(script({}), { storage }).preset).toBe("dune");
  });

  it("with storage blocked, only the cookie decides (same as the function)", () => {
    for (const input of [{}, { presetCookie: "dune" }, { presetCookie: "carnet" }, { presetCookie: "sepia" }]) {
      expect(applied(script(input), { blocked: true }).preset).toBe(resolvePreset(input));
    }
  });

  it("never changes the colour mode", () => {
    expect(applied(script({ presetCookie: "sahel" }, "light")).classes).toEqual(["light"]);
    expect(applied(script({}, "dark")).classes).toEqual(["dark"]);
    expect(applied(script({}, "system"), { dark: false }).classes).toEqual(["light"]);
    expect(applied(script({}, "dark", false), { storage: { theme: "light" } }).mode).toBe("light");
  });
});

describe("preset: server, bootstrap and provider share one source", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("layout.tsx decides through the shared module and holds no preset literal", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("@/lib/appearance/preset");
    expect(layout).toContain("resolvePreset(");
    expect(layout).toContain("appearanceBootstrapScript(");
    expect(layout).not.toContain("sahelflow-look");
    expect(layout).not.toMatch(/"atlas"|'atlas'/);
  });

  it("the provider decides through the shared module and holds no preset literal", () => {
    const provider = read("src/components/theme-provider.tsx");
    expect(provider).toContain("@/lib/appearance/preset");
    expect(provider).toContain("resolvePreset(");
    expect(provider).not.toContain("sahelflow-look");
    expect(provider).not.toMatch(/"atlas"|'atlas'/);
  });
});
