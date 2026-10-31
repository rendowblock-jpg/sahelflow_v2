import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_PRESET } from "@/lib/appearance/look";
import { RUNTIME_LAUNCH_APPEARANCE_PATH } from "@/lib/runtime-auth";
import { LAUNCH_APPEARANCE_FILE, readLaunchAppearance } from "@/lib/runtime/launch-appearance";

/**
 * The startup card matches the workspace only if four separate pieces agree:
 * the browser reports a change, the server records it, the proxy lets the
 * report through its runtime boundary, and the Rust shell reads the same file
 * with the same vocabulary. These tests pin each seam.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** The source of one top-level function, up to its closing brace at column 0. */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `missing ${signature}`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end + 3);
}

function group(match: RegExpMatchArray, index: number): string {
  const value = match[index];
  if (value === undefined) throw new Error(`regex group ${index} is missing`);
  return value;
}

/** The quoted words inside the first capture group of `pattern`, e.g. a union type or a list. */
function quotedWords(source: string, pattern: RegExp): string[] {
  const match = source.match(pattern);
  if (!match) throw new Error(`pattern not found in source: ${pattern}`);
  return [...group(match, 1).matchAll(/"(\w+)"/g)].map((word) => group(word, 1));
}

const cookies = (values: Record<string, string>) => ({
  get: (name: string) => {
    const value = values[name];
    return value === undefined ? undefined : { value };
  },
});

describe("how the workspace reports its appearance", () => {
  it("reports after every interactive change of mode, preset and language", () => {
    const provider = read("src/components/theme-provider.tsx");
    const persistTheme = functionBody(provider, "function persistTheme(");
    const persistPreset = functionBody(provider, "function persistPreset(");
    for (const body of [persistTheme, persistPreset]) {
      // After the cookie is written, because the server reads the cookie.
      expect(body.indexOf("persistCookie(")).toBeGreaterThan(-1);
      expect(body.indexOf("reportLaunchAppearance()")).toBeGreaterThan(body.indexOf("persistCookie("));
    }
    const store = read("src/stores/ui-store.ts");
    const requestLocale = functionBody(store, "export function requestLocale(");
    expect(requestLocale.indexOf("reportLaunchAppearance()")).toBeGreaterThan(
      requestLocale.indexOf("setLocaleCookie("),
    );
  });

  it("only these two modules write the three cookies, so none can be missed", () => {
    const writers = ["src/components/theme-provider.tsx", "src/stores/ui-store.ts"];
    for (const path of writers) {
      expect(read(path)).toContain('from "@/lib/runtime/report-launch-appearance"');
    }
  });

  it("the packaged-app report is gated on the desktop's loopback address", () => {
    const client = read("src/lib/runtime/report-launch-appearance.ts");
    expect(client).toContain('window.location.hostname !== "127.0.0.1"');
    expect(client).toContain("RUNTIME_LAUNCH_APPEARANCE_PATH");
    expect(client).not.toContain("body:");
  });
});

describe("how the server records it", () => {
  it("the route sits behind the per-launch runtime cookie, compared in constant time", () => {
    const route = read("src/app/api/internal/launch-appearance/route.ts");
    expect(route).toContain("constantTimeEqual(supplied, expectedToken)");
    expect(route).toContain("RUNTIME_COOKIE");
    expect(route).toContain("readLaunchAppearance(request.cookies)");
    // It never reads a body.
    expect(route).not.toMatch(/request\.(json|text|formData|arrayBuffer)\(/);
  });

  it("the proxy admits it only after the runtime-cookie boundary", () => {
    const proxy = read("src/proxy.ts");
    const boundary = proxy.indexOf("const runtimeAppToken = process.env.SF_RUNTIME_APP_TOKEN");
    const admitted = proxy.indexOf("pathname === RUNTIME_LAUNCH_APPEARANCE_PATH");
    expect(boundary).toBeGreaterThan(-1);
    expect(admitted).toBeGreaterThan(boundary);
    expect(RUNTIME_LAUNCH_APPEARANCE_PATH).toBe("/api/internal/launch-appearance");
  });

  it("the UI-ready report records it too, after the ready evidence and before workers start", () => {
    const route = read("src/app/api/internal/runtime-ui-ready/route.ts");
    const record = route.indexOf("recordLaunchAppearance(dataDir, readLaunchAppearance(request.cookies))");
    expect(record).toBeGreaterThan(route.indexOf('code: "RUNTIME_UI_DIAGNOSTIC_PERSIST_FAILED"'));
    const finalStart = route.lastIndexOf("requestBackgroundStart();");
    expect(finalStart).toBeGreaterThan(record);
  });

  it("is never cleared by a launch: the desktop only clears the ready receipt", () => {
    const recovery = read("src-tauri/src/startup_recovery/proven.rs");
    expect(recovery).not.toContain(LAUNCH_APPEARANCE_FILE);
    const shell = read("src-tauri/src/launch_screen.rs");
    expect(shell).not.toMatch(/remove_file[^;]*LAUNCH_APPEARANCE_FILE/);
  });
});

describe("how the Rust shell reads it", () => {
  const rust = read("src-tauri/src/launch_screen.rs");

  it("opens the same file the server writes", () => {
    expect(rust).toContain(`const LAUNCH_APPEARANCE_FILE: &str = "${LAUNCH_APPEARANCE_FILE}";`);
  });

  it("reads the same three field names", () => {
    const record = rust.slice(rust.indexOf("struct LaunchAppearanceRecord"));
    const body = record.slice(0, record.indexOf("}"));
    for (const field of ["locale", "theme", "preset"]) {
      expect(body).toMatch(new RegExp(`\\b${field}: Option<String>`));
    }
    expect(Object.keys(readLaunchAppearance(cookies({})))).toEqual(["locale", "theme", "preset"]);
  });

  function tagsIn(fnName: string): string[] {
    const start = rust.indexOf(`fn ${fnName}(`);
    expect(start, `missing ${fnName}`).toBeGreaterThan(-1);
    const body = rust.slice(start, rust.indexOf("\n}\n", start));
    return [...body.matchAll(/"(\w+)"\s*=>/g)].map((match) => group(match, 1));
  }

  it("understands exactly the language, mode and preset tags the workspace writes", () => {
    const providerSource = read("src/components/theme-provider.tsx");
    const presets = quotedWords(read("src/lib/appearance/look.ts"), /export const PRESETS = \[([^\]]*)\]/);
    const modes = quotedWords(providerSource, /export type ThemeMode = ([^;]*);/);
    const locales = ["ar", "fr", "en"];

    // Carnet is recorded for the card but launch_screen.rs does not have a Preset::Carnet arm yet (it then wears its
    // Sahel default). When the Rust side learns "carnet", this list must become empty: the equality below fails first.
    const NATIVE_PENDING = ["carnet"];
    expect(tagsIn("preset_from_tag").sort()).toEqual(presets.filter((preset) => !NATIVE_PENDING.includes(preset)).sort());
    expect(tagsIn("theme_from_tag").sort()).toEqual([...modes].sort());
    expect(tagsIn("locale_from_tag").sort()).toEqual([...locales].sort());

    // And the server accepts every one of them, so none is silently dropped.
    for (const preset of presets) {
      expect(readLaunchAppearance(cookies({ "sahelflow-theme-preset": preset })).preset).toBe(preset);
    }
    for (const mode of modes) {
      expect(readLaunchAppearance(cookies({ "sahelflow-theme": mode })).theme).toBe(mode);
    }
    for (const locale of locales) {
      expect(readLaunchAppearance(cookies({ "sahelflow-locale": locale })).locale).toBe(locale);
    }
  });

  it("falls back to the workspace default (dark, Sahel) when nothing is recorded", () => {
    expect(rust).toMatch(/pub const DEFAULT: Appearance = Appearance \{\s*theme: Theme::Dark,\s*preset: Preset::Sahel,/);
    expect(read("src/app/layout.tsx")).toContain('hasThemeCookie ? themeCookie : "dark"');
    // The workspace itself now defaults to Carnet (lib/appearance/look.ts); the native card still defaults to Sahel.
    expect(DEFAULT_PRESET).toBe("carnet");
    expect(read("src/app/layout.tsx")).toContain("resolveLook({ presetCookie, lookCookie }).preset");
  });
});
