import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * The Carnet look (cream paper, graphite ink, IBM Plex and Amiri type) was removed on the founder's order.
 * These checks keep it removed: no style, no font, no licence for a font that is no longer shipped, no name left
 * in the application source. Only this file and the two tests that feed an old saved value to the real code may say the word.
 */

const root = process.cwd();
const SELF = "src/lib/appearance/__tests__/carnet-removed-contract.test.ts";
/** These two feed a saved "carnet" preset (what every install had) to the real code, so they must spell it. */
const LEGACY_VALUE_TESTS = [
  "src/lib/appearance/__tests__/preset.test.ts",
  "src/components/settings/__tests__/appearance-panel.render.test.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(root, full).replaceAll("\\", "/"));
  }
  return out;
}

const TEXT = /\.(ts|tsx|css|json|md|mjs)$/;
const sourceFiles = walk(resolve(root, "src")).filter(
  (path) => TEXT.test(path) && path !== SELF && !LEGACY_VALUE_TESTS.includes(path),
);

describe("the Carnet look is gone from the application source", () => {
  it("has no stylesheet, token, class, key, file name or comment that names it", () => {
    const offenders = sourceFiles.filter(
      (path) => /carnet/i.test(path) || /carnet/i.test(readFileSync(resolve(root, path), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("does not import or ship its identity stylesheet", () => {
    expect(existsSync(resolve(root, "src/app/carnet-identity.css"))).toBe(false);
  });

  it("does not ship the Plex or Amiri font files", () => {
    const fonts = readdirSync(resolve(root, "src/app/fonts"));
    expect(fonts.filter((name) => /plex|amiri/i.test(name))).toEqual([]);
    const layout = readFileSync(resolve(root, "src/app/layout.tsx"), "utf8");
    expect(layout).not.toMatch(/plex|amiri/i);
  });

  it("does not carry the licences of fonts that are no longer shipped", () => {
    const licences = readdirSync(resolve(root, "src-tauri/licenses"));
    expect(licences.filter((name) => /plex|amiri/i.test(name))).toEqual([]);
  });
});
