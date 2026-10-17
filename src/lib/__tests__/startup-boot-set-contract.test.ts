import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// The packaged server is started from a slow disk on some seller PCs. What it
// opens before its first request is the floor of every launch, so the boot set
// is pinned here. Evidence: strace of the shipped Internal.43 server tree,
// 871 files / 28.6 MB with Next's default preload versus 483 files / 4.0 MB
// without it.
describe("server boot set", () => {
  it("does not make the production server load every route module at start", () => {
    const config = read("next.config.ts");
    const experimental = config.slice(config.indexOf("experimental: {"));
    expect(experimental).toMatch(/preloadEntriesOnStart:\s*false/);
  });

  it("loads the 12 MB googleapis bundle only when a Sheets call needs it", () => {
    const source = read("src/lib/integrations/google-sheets/index.ts");
    expect(source).not.toMatch(/^import\s[^;]*from\s+["']googleapis["']/m);
    expect(source).toContain('await import("googleapis")');
  });

  it("keeps googleapis out of every other static import in the app", () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(resolve(process.cwd(), "src"), {
      recursive: true,
    })) {
      const path = String(entry).replaceAll("\\", "/");
      if (!/\.(ts|tsx)$/.test(path) || /__tests__|\.test\./.test(path)) continue;
      if (/^import\s[^;]*from\s+["']googleapis["']/m.test(read(`src/${path}`))) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });
});
