import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A Tailwind colour class such as `text-destructive-foreground` only does something when the theme defines the
 * matching `--color-destructive-foreground` token. When it does not, the class is silently dropped and the text falls
 * back to the page ink: a red button with dark text, 2.53:1 in dark mode. Nothing fails at build time, so this test is
 * the only thing that catches it.
 */
const root = resolve(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name === ".next") continue;
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(root);
const text = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

const defined = new Set<string>();
for (const body of text.values()) {
  for (const m of body.matchAll(/--color-([a-z0-9-]+)\s*:/g)) defined.add(m[1]);
}

// text-NAME-foreground, bg-NAME-foreground, border-NAME-foreground ... with any variant prefix and an optional /opacity.
const USE = /\b(?:text|bg|border|ring|fill|stroke|outline|divide|from|to|via|decoration|accent|caret|shadow)-([a-z][a-z0-9-]*)-foreground\b/g;

function undefinedUses(): string[] {
  const found: string[] = [];
  for (const [file, body] of text) {
    const lines = body.split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(USE)) {
        const token = `${m[1]}-foreground`;
        if (!defined.has(token)) found.push(`${relative(process.cwd(), file)}:${i + 1} ${m[0]} (no --color-${token})`);
      }
    });
  }
  return found;
}

describe("theme foreground colour classes", () => {
  it("reads the theme and the source (the guard is not scanning nothing)", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(defined.has("primary-foreground")).toBe(true);
    expect(defined.has("muted-foreground")).toBe(true);
    // A class that is used all over the app and is defined: proves the scan sees real uses.
    const uses = [...text.values()].join("\n").match(USE) ?? [];
    expect(uses.length).toBeGreaterThan(50);
  });

  it("every NAME-foreground colour class used in src has a --color-NAME-foreground token", () => {
    expect(undefinedUses()).toEqual([]);
  });

  it("the matcher itself catches the known bad class (a fixture, not the source)", () => {
    const bad = "bg-destructive text-destructive-foreground hover:bg-destructive/90";
    const names = [...bad.matchAll(USE)].map((m) => `${m[1]}-foreground`);
    expect(names).toEqual(["destructive-foreground"]);
    expect(defined.has("destructive-foreground")).toBe(false);
  });
});
