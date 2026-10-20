import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The startup card draws the word "SahelFlow" as an outline made from the
 * Manrope font (SIL Open Font License 1.1). That licence requires the
 * copyright notice and the licence text to travel with every copy of the
 * software, so the text is kept in src-tauri/licenses and installed next to
 * the app. This test fails if the file, the installer entry or the pointer in
 * the source goes missing.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("third-party licence notices ship with the app", () => {
  it("keeps the Manrope OFL 1.1 text with its copyright line", () => {
    const text = read("src-tauri/licenses/Manrope-OFL.txt");
    expect(text).toMatch(/^Copyright 2018 The Manrope Project Authors/);
    expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(text).toContain("PERMISSION & CONDITIONS");
  });

  it("installs the licenses folder next to the app", () => {
    const config = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      bundle: { resources: Record<string, string> };
    };
    expect(config.bundle.resources["licenses/"]).toBe("licenses/");
  });

  it("points the reader of the outline to the licence", () => {
    const source = read("src-tauri/src/native_splash.rs");
    expect(source).toContain("SIL Open Font");
    expect(source).toContain("src-tauri/licenses/Manrope-OFL.txt");
  });
});
