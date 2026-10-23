import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The workspace faces (Inter for Latin, Noto Sans Arabic for Arabic) are files in the repository, not a download.
 * `next/font/google` asks fonts.googleapis.com every time the dev server starts and at every production build. In CI
 * that request sometimes fails, the dev server then answers every page with a module error, and the browser jobs of
 * a pull request go red until someone re-runs them (register NEW-CI-FONT-FLAKE: #582, #584, #593 twice). A file
 * on disk cannot fail that way. Both fonts are under the SIL Open Font License 1.1, which asks that the licence text
 * travel with the software, so the texts sit beside the Manrope one in src-tauri/licenses and are installed with the app.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const FONTS = [
  { file: "src/app/fonts/inter-latin-wght-normal.woff2", licence: "src-tauri/licenses/Inter-OFL.txt", owner: "Copyright 2016 The Inter Project Authors" },
  { file: "src/app/fonts/noto-sans-arabic-arabic-wght-normal.woff2", licence: "src-tauri/licenses/NotoSansArabic-OFL.txt", owner: "Copyright 2022 The Noto Project Authors" },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("workspace fonts are files in the repository", () => {
  it("no source file imports next/font/google", () => {
    const offenders = sourceFiles(resolve(root, "src")).filter((path) => /from\s+["']next\/font\/google["']/.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => path.replace(root, ""))).toEqual([]);
  });

  it("the layout loads both faces from local woff2 files under the same CSS variables", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('from "next/font/local"');
    for (const font of FONTS) expect(layout).toContain(font.file.replace("src/app/", "./"));
    expect(layout).toContain('variable: "--font-inter"');
    expect(layout).toContain('variable: "--font-arabic"');
  });

  it("each font file exists, is a real woff2 and is not an empty stub", () => {
    for (const font of FONTS) {
      expect(existsSync(resolve(root, font.file)), font.file).toBe(true);
      const bytes = readFileSync(resolve(root, font.file));
      expect(bytes.subarray(0, 4).toString("latin1"), font.file).toBe("wOF2");
      expect(bytes.length, font.file).toBeGreaterThan(20_000);
    }
  });

  it("each font travels with its OFL 1.1 text and copyright line", () => {
    for (const font of FONTS) {
      const text = read(font.licence);
      expect(text, font.licence).toContain(font.owner);
      expect(text, font.licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
      expect(text, font.licence).toContain("PERMISSION & CONDITIONS");
    }
  });

  it("the licences folder is installed next to the app", () => {
    const config = JSON.parse(read("src-tauri/tauri.conf.json")) as { bundle: { resources: Record<string, string> } };
    expect(config.bundle.resources["licenses/"]).toBe("licenses/");
  });
});
