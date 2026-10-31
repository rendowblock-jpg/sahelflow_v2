import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Three "coming soon" strings had no reader. One of them promised a courier API; a promise nobody shows is still a promise in the file.
const DEAD_KEYS = ["common.comingSoon", "delivery.apiComingSoonUseCsv", "store.comingSoon"];
const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "locales" || name === "dead-coming-soon-keys.test.ts") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

describe("dead coming-soon keys", () => {
  for (const locale of ["ar", "fr", "en"]) {
    it(`${locale}.json no longer carries them`, () => {
      const messages = JSON.parse(readFileSync(join(root, `src/lib/i18n/locales/${locale}.json`), "utf8")) as Record<string, string>;
      for (const key of DEAD_KEYS) expect(Object.keys(messages), `${locale} ${key}`).not.toContain(key);
    });
  }

  it("nothing in src, control-plane or marketing reads them", () => {
    const files = ["src", "control-plane", "marketing/src"].flatMap((dir) => walk(join(root, dir)));
    expect(files.length).toBeGreaterThan(100);
    const readers = files.filter((file) => {
      const text = readFileSync(file, "utf8");
      return DEAD_KEYS.some((key) => text.includes(key));
    });
    expect(readers).toEqual([]);
  });
});
