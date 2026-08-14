import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const roots = [resolve(root, "src/app"), resolve(root, "src/components")];

const PHYSICAL_CLASS =
  /(?<![\w-])(?:ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r|scroll-ml|scroll-mr)-[^\s"'`}]+/g;

// A small set of primitives expose an explicit physical side as part of their
// public API (for example Sheet `side="left" | "right"`). That implementation
// must mirror the whole surface and is therefore not equivalent to accidentally
// using physical spacing inside product layout. Keep this allow-list tiny.
const ALLOW_FILES = new Set([
  "src/components/ui/sheet.tsx",
  "src/components/ui/drawer.tsx",
]);

function filesUnder(path: string): string[] {
  const entries = readdirSync(path);
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = resolve(path, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      files.push(...filesUnder(absolute));
      continue;
    }
    if (/\.(?:tsx|ts)$/.test(entry)) files.push(absolute);
  }
  return files;
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

describe("Internal.17 logical RTL geometry adoption", () => {
  it("keeps production layout spacing and borders flow-relative", () => {
    const violations: string[] = [];

    for (const absolute of roots.flatMap(filesUnder)) {
      const file = relative(root, absolute).replaceAll("\\", "/");
      if (ALLOW_FILES.has(file)) continue;
      const source = readFileSync(absolute, "utf8");
      for (const match of source.matchAll(PHYSICAL_CLASS)) {
        violations.push(
          `${file}:${lineNumber(source, match.index ?? 0)} ${match[0]}`,
        );
      }
    }

    expect(
      violations,
      `Physical directional Tailwind utilities remain in product UI:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
