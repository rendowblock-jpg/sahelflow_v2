import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LAUNCH_APPEARANCE_FILE,
  readLaunchAppearance,
  recordLaunchAppearance,
} from "../launch-appearance";

let dataDir: string;

function cookies(values: Record<string, string>) {
  return {
    get(name: string) {
      const value = values[name];
      return value === undefined ? undefined : { value };
    },
  };
}

function stored(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dataDir, LAUNCH_APPEARANCE_FILE), "utf8"));
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "sf-launch-appearance-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("launch appearance cookies", () => {
  it("reads exactly the three known tags", () => {
    expect(
      readLaunchAppearance(
        cookies({
          "sahelflow-locale": "ar",
          "sahelflow-theme": "system",
          "sahelflow-theme-preset": "dune",
        }),
      ),
    ).toEqual({ locale: "ar", theme: "system", preset: "dune" });
  });

  it("reads every language, mode and preset the workspace offers", () => {
    for (const locale of ["ar", "fr", "en"]) {
      expect(readLaunchAppearance(cookies({ "sahelflow-locale": locale })).locale).toBe(locale);
    }
    for (const theme of ["light", "dark", "system"]) {
      expect(readLaunchAppearance(cookies({ "sahelflow-theme": theme })).theme).toBe(theme);
    }
    for (const preset of ["sahel", "atlas", "oasis", "dune"]) {
      expect(readLaunchAppearance(cookies({ "sahelflow-theme-preset": preset })).preset).toBe(
        preset,
      );
    }
  });

  it("treats anything else as 'not chosen', never as an arbitrary string", () => {
    expect(
      readLaunchAppearance(
        cookies({
          "sahelflow-locale": "../../etc/passwd",
          "sahelflow-theme": "Light",
          "sahelflow-theme-preset": "neon\u0000",
        }),
      ),
    ).toEqual({ locale: null, theme: null, preset: null });
    expect(readLaunchAppearance(cookies({}))).toEqual({
      locale: null,
      theme: null,
      preset: null,
    });
  });
});

describe("recording the launch appearance", () => {
  it("writes a small versioned JSON record the desktop shell can read", () => {
    expect(recordLaunchAppearance(dataDir, { locale: "ar", theme: "light", preset: "atlas" })).toBe(
      true,
    );
    expect(stored()).toMatchObject({
      formatVersion: 1,
      locale: "ar",
      theme: "light",
      preset: "atlas",
    });
    expect(typeof stored().updatedAtUnixSeconds).toBe("number");
    // The shell refuses files over 64 KiB; this one is tiny.
    expect(statSync(join(dataDir, LAUNCH_APPEARANCE_FILE)).size).toBeLessThan(512);
  });

  it("records 'not chosen' as null so the card falls back to the workspace default", () => {
    recordLaunchAppearance(dataDir, { locale: null, theme: null, preset: null });
    expect(stored()).toMatchObject({ locale: null, theme: null, preset: null });
  });

  it("does not rewrite the file when nothing changed", () => {
    const appearance = { locale: "fr", theme: "dark", preset: "sahel" } as const;
    recordLaunchAppearance(dataDir, appearance);
    const path = join(dataDir, LAUNCH_APPEARANCE_FILE);
    // Age the file so an unwanted rewrite would visibly move its mtime.
    const past = new Date(Date.now() - 60_000);
    utimesSync(path, past, past);
    const before = statSync(path).mtimeMs;
    expect(recordLaunchAppearance(dataDir, appearance)).toBe(true);
    expect(statSync(path).mtimeMs).toBe(before);
  });

  it("rewrites the file when any one of the three changes", () => {
    recordLaunchAppearance(dataDir, { locale: "fr", theme: "dark", preset: "sahel" });
    recordLaunchAppearance(dataDir, { locale: "fr", theme: "dark", preset: "oasis" });
    expect(stored().preset).toBe("oasis");
    recordLaunchAppearance(dataDir, { locale: "fr", theme: "light", preset: "oasis" });
    expect(stored().theme).toBe("light");
    recordLaunchAppearance(dataDir, { locale: "en", theme: "light", preset: "oasis" });
    expect(stored().locale).toBe("en");
  });

  it("leaves no temporary file behind", () => {
    recordLaunchAppearance(dataDir, { locale: "ar", theme: "dark", preset: "dune" });
    recordLaunchAppearance(dataDir, { locale: "en", theme: "dark", preset: "dune" });
    expect(readdirSync(dataDir)).toEqual([LAUNCH_APPEARANCE_FILE]);
  });

  it("creates the data directory when it does not exist yet", () => {
    const nested = join(dataDir, "not", "yet");
    expect(recordLaunchAppearance(nested, { locale: "fr", theme: null, preset: null })).toBe(true);
    expect(existsSync(join(nested, LAUNCH_APPEARANCE_FILE))).toBe(true);
  });

  it("reports failure instead of throwing, and keeps the previous record", () => {
    recordLaunchAppearance(dataDir, { locale: "fr", theme: "dark", preset: "sahel" });
    // A directory where the record belongs makes the final rename fail.
    rmSync(join(dataDir, LAUNCH_APPEARANCE_FILE));
    mkdirSync(join(dataDir, LAUNCH_APPEARANCE_FILE));
    writeFileSync(join(dataDir, LAUNCH_APPEARANCE_FILE, "keep"), "x");
    expect(recordLaunchAppearance(dataDir, { locale: "ar", theme: "light", preset: "dune" })).toBe(
      false,
    );
    expect(existsSync(join(dataDir, `${LAUNCH_APPEARANCE_FILE}.tmp`))).toBe(false);
  });

  it("treats an unreadable previous record as different and replaces it", () => {
    writeFileSync(join(dataDir, LAUNCH_APPEARANCE_FILE), "not json");
    expect(recordLaunchAppearance(dataDir, { locale: "en", theme: "dark", preset: "sahel" })).toBe(
      true,
    );
    expect(stored()).toMatchObject({ locale: "en" });
  });
});
