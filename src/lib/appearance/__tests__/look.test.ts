import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRESET,
  LOOK_KEY,
  LOOK_VERSION,
  PRESETS,
  appearanceBootstrapScript,
  parsePreset,
  resolveLook,
  type LookInput,
} from "../look";

/*
 * The one-time look migration (Wave 1, track A). Every install that has no
 * `sahelflow-look` marker, including one whose cookie already says `sahel`
 * (the provider stores the default as if it were a choice), is moved to Carnet
 * once; after the marker exists the saved valid preset is respected.
 */

type Row = [name: string, input: LookInput, preset: string, write: boolean];

const MARK = LOOK_VERSION;

const TABLE: Row[] = [
  ["new install: nothing stored", {}, "carnet", true],
  ["null inputs equal missing inputs", { presetCookie: null, presetStorage: null, lookCookie: null, lookStorage: null }, "carnet", true],
  ["old install, cookie sahel, no marker", { presetCookie: "sahel" }, "carnet", true],
  ["old install, cookie dune, no marker", { presetCookie: "dune" }, "carnet", true],
  ["old install, storage atlas only, no marker", { presetStorage: "atlas" }, "carnet", true],
  ["cookie and storage disagree, no marker", { presetCookie: "oasis", presetStorage: "atlas" }, "carnet", true],
  ["cookie already carnet, no marker: still writes the marker", { presetCookie: "carnet" }, "carnet", true],
  ["marker in cookie respects cookie preset", { presetCookie: "sahel", lookCookie: MARK }, "sahel", false],
  ["marker in storage respects storage preset", { presetStorage: "dune", lookStorage: MARK }, "dune", false],
  ["marker in storage respects cookie preset", { presetCookie: "atlas", lookStorage: MARK }, "atlas", false],
  ["marker in cookie respects storage preset", { presetStorage: "oasis", lookCookie: MARK }, "oasis", false],
  ["cookie wins over storage when both valid", { presetCookie: "atlas", presetStorage: "dune", lookCookie: MARK }, "atlas", false],
  ["invalid cookie falls through to valid storage", { presetCookie: "sepia", presetStorage: "oasis", lookCookie: MARK }, "oasis", false],
  ["invalid everywhere with marker: carnet, nothing to write", { presetCookie: "sepia", presetStorage: "Dune", lookCookie: MARK }, "carnet", false],
  ["marker, no preset anywhere (storage blocked)", { lookCookie: MARK }, "carnet", false],
  ["marker only in blocked storage is unknown: migrate", { presetCookie: "sahel", lookStorage: null }, "carnet", true],
  ["marker value 1 is not the marker", { presetCookie: "sahel", lookCookie: "1" }, "carnet", true],
  ["marker value 3 is not the marker", { presetCookie: "sahel", lookCookie: "3" }, "carnet", true],
  ["marker value empty is not the marker", { presetCookie: "sahel", lookCookie: "" }, "carnet", true],
  ["marker value 22 is not the marker", { presetCookie: "sahel", lookStorage: "22" }, "carnet", true],
  ["preset names are case sensitive", { presetCookie: "Sahel", lookCookie: MARK }, "carnet", false],
  ["a user who picked carnet keeps it", { presetCookie: "carnet", lookCookie: MARK }, "carnet", false],
];

describe("look migration: the pure decision", () => {
  it("lists Carnet first and makes it the default", () => {
    expect([...PRESETS]).toEqual(["carnet", "sahel", "atlas", "oasis", "dune"]);
    expect(DEFAULT_PRESET).toBe("carnet");
    expect(LOOK_KEY).toBe("sahelflow-look");
    expect(LOOK_VERSION).toBe("2");
  });

  it("validates preset names exactly", () => {
    for (const preset of PRESETS) expect(parsePreset(preset)).toBe(preset);
    for (const bad of ["", "CARNET", "ledger", "sepia", " sahel", undefined, null]) {
      expect(parsePreset(bad)).toBeNull();
    }
  });

  it.each(TABLE)("%s", (_name, input, preset, write) => {
    expect(resolveLook(input)).toEqual({ preset, write });
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

describe("look migration: the inline bootstrap script cannot disagree with the function", () => {
  const script = (input: LookInput, theme = "dark", hasThemeCookie = true) =>
    appearanceBootstrapScript({
      theme,
      hasThemeCookie,
      presetCookie: input.presetCookie ?? undefined,
      lookCookie: input.lookCookie ?? undefined,
    });

  it("carries the same preset list as the source of truth", () => {
    const text = script({});
    expect(text).toContain(JSON.stringify(PRESETS));
    expect(text).toContain(JSON.stringify(LOOK_KEY));
    expect(text).toContain(JSON.stringify(LOOK_VERSION));
    expect(text).not.toContain("'sahel'||");
  });

  it.each(TABLE)("%s (script)", (_name, input, preset) => {
    const storage: Record<string, string> = {};
    if (typeof input.presetStorage === "string") storage["sahelflow-theme-preset"] = input.presetStorage;
    if (typeof input.lookStorage === "string") storage[LOOK_KEY] = input.lookStorage;
    expect(applied(script(input), { storage }).preset).toBe(preset);
  });

  it("with storage blocked, only the cookies decide (same as the function)", () => {
    for (const input of [{}, { presetCookie: "sahel" }, { presetCookie: "sahel", lookCookie: MARK }, { lookCookie: MARK }]) {
      expect(applied(script(input), { blocked: true }).preset).toBe(resolveLook(input).preset);
    }
  });

  it("never changes the colour mode", () => {
    expect(applied(script({ presetCookie: "sahel" }, "light")).classes).toEqual(["light"]);
    expect(applied(script({}, "dark")).classes).toEqual(["dark"]);
    expect(applied(script({}, "system"), { dark: false }).classes).toEqual(["light"]);
    expect(applied(script({}, "dark", false), { storage: { theme: "light" } }).mode).toBe("light");
  });
});

describe("look migration: server, bootstrap and provider share one source", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("layout.tsx decides through the shared module and holds no preset literal", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("@/lib/appearance/look");
    expect(layout).toContain("resolveLook(");
    expect(layout).toContain("appearanceBootstrapScript(");
    expect(layout).toContain('cookieStore.get("sahelflow-look")');
    expect(layout).not.toMatch(/"atlas"|'atlas'/);
  });

  it("the provider decides through the shared module and holds no preset literal", () => {
    const provider = read("src/components/theme-provider.tsx");
    expect(provider).toContain("@/lib/appearance/look");
    expect(provider).toContain("resolveLook(");
    expect(provider).not.toMatch(/"atlas"|'atlas'/);
    expect(provider).toContain("LOOK_KEY");
  });
});
