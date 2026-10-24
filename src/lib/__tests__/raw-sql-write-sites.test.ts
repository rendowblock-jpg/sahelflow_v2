/**
 * S01a-08: raw SQL writes bypass the Prisma extension chain (withShopAuthority,
 * withSafetyGuards, the PII codecs) and rely on per-site discipline. This contract
 * makes that surface visible and deliberate:
 *
 *  1. No production source may use the *Unsafe raw-SQL APIs (string-built SQL).
 *  2. The files that contain tagged-template `$executeRaw` WRITES are pinned. A new
 *     file fails this test on purpose: confirm the new site runs behind
 *     assertProcessShopAuthority (the command kernel does; routes get it from
 *     withErrorHandler in production), skips no PII codec it needs, and then add
 *     the file below in the same change.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const PINNED_RAW_WRITE_FILES = [
  "src/lib/ai/actions/service.ts",
  "src/lib/business-truth/command-kernel.ts",
  "src/lib/connected-platform/storefront-delegation.ts",
  "src/lib/orders/canonical-order-recovery.ts",
  "src/lib/orders/canonical-return-authority.ts",
  // Queues every customer and order for a token rebuild once (INSERT OR IGNORE into
  // SearchProjectionDirty, one marker row in SearchProjectionRevision). Index tables
  // only: no PII column, no codec involved. Runs on the shop client inside one
  // transaction, from search routes (withErrorHandler) and the warm-up.
  "src/lib/search/local-search-projection.ts",
];

function productionSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      productionSources(path, found);
    } else if (
      /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      found.push(path);
    }
  }
  return found;
}

function codeLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !(
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      );
    });
}

function relativePath(path: string): string {
  return path.slice(ROOT.length + 1).replace(/\\/g, "/");
}

const sources = productionSources(join(ROOT, "src"));

describe("raw SQL write sites (S01a-08)", () => {
  it("scans a plausible number of production sources", () => {
    expect(sources.length).toBeGreaterThan(500);
  });

  it("never uses the *Unsafe raw-SQL APIs in production code", () => {
    const offenders = sources.filter((path) =>
      codeLines(path).some((line) => /\$(?:execute|query)RawUnsafe\b/.test(line)),
    );
    expect(offenders.map(relativePath)).toEqual([]);
  });

  it("pins the files that contain $executeRaw writes", () => {
    const writers = sources
      .filter((path) => codeLines(path).some((line) => /\$executeRaw\b/.test(line)))
      .map(relativePath)
      .sort();
    expect(writers).toEqual([...PINNED_RAW_WRITE_FILES].sort());
  });
});
