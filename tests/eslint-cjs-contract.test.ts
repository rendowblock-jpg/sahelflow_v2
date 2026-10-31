// @vitest-environment node
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// `eslint .` (the Quality Gate's lint step, `bun run lint`) CRASHED for the whole repository on the first CommonJS file added
// outside an ignored folder: eslint.config.mjs names the rule react-hooks/exhaustive-deps for every file, but
// eslint-config-next defines the react-hooks plugin only for js/jsx/mjs/ts/tsx/mts/cts. A .cjs file therefore has the rule
// and no plugin, and ESLint stops with "could not find plugin react-hooks" before it lints anything. The two measuring
// scripts of the hosted-store work were .cjs files: Modal's sf-verify showed "FAIL ESLint (1394 ms)", the changed-files
// lint that runs locally never saw it. This test fails when a .cjs file exists that the config does not ignore.

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".next", ".git", "coverage", "test-results", "playwright-report", "out", "build", "dist", "target"]);

function cjsFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) cjsFiles(join(directory, entry.name), found);
    } else if (entry.name.endsWith(".cjs")) {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

describe("eslint . cannot crash on a CommonJS file", () => {
  it("every .cjs file in the tree, and any future one, is ignored by the config", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const files = cjsFiles(ROOT);
    const notIgnored: string[] = [];
    for (const file of files) {
      if (!(await eslint.isPathIgnored(file))) notIgnored.push(relative(ROOT, file).replaceAll("\\", "/"));
    }
    expect(notIgnored, `these .cjs files make "eslint ." stop with "could not find plugin react-hooks": ${notIgnored.join(", ")}`).toEqual([]);
    expect(await eslint.isPathIgnored(join(ROOT, "some/new/folder/tool.cjs"))).toBe(true);
  }, 60_000);
});
