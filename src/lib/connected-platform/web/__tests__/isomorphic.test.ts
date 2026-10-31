// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB_DIR = fileURLToPath(new URL("..", import.meta.url));
const FILES = readdirSync(WEB_DIR).filter((name) => name.endsWith(".ts"));

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the web folder is safe to bundle for a browser", () => {
  it("has the files the brief names", () => {
    for (const name of ["bytes.ts", "canonical.ts", "keys.ts", "envelope-web.ts", "fingerprint.ts", "index.ts"]) {
      expect(FILES).toContain(name);
    }
  });

  it.each(FILES)("%s uses no node, server-only or Buffer", (name) => {
    const source = code(readFileSync(`${WEB_DIR}${name}`, "utf8"));
    expect(source).not.toMatch(/from\s+["']node:/);
    expect(source).not.toMatch(/from\s+["'](crypto|fs|path|os|buffer|stream)["']/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toContain("server-only");
    expect(source).not.toMatch(/\bBuffer\b/);
    expect(source).not.toMatch(/\bprocess\./);
    // Only the pure protocol module may be imported from outside this folder.
    for (const match of source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
      const target = match[1] ?? "";
      expect(target.startsWith("./") || target === "../protocol", `${name} imports ${target}`).toBe(true);
    }
  });

  it("protocol.ts, which the web folder imports, stays free of node and server-only", () => {
    const source = code(readFileSync(`${WEB_DIR}../protocol.ts`, "utf8"));
    expect(source).not.toContain("server-only");
    expect(source).not.toMatch(/from\s+["']node:/);
  });
});
