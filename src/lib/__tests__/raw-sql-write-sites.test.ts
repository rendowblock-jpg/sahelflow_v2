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

/**
 * Rule 1 has two reviewed exceptions: the conversation-search indexer and its query path
 * (PB-CONV-SEARCH-LOAD). They are the only production files that talk to the index tables through an injected client.
 * Every value they send is a bound parameter; the text they build is a list of "?" placeholders. That is pinned by
 * src/lib/search/__tests__/conversation-search-raw-boundary-contract.test.ts (allowed interpolations, allowed tables,
 * allowed Message columns, the index module is imported by one file only). A third file needs its own review: add it
 * here only together with the same contract.
 */
const UNSAFE_API_EXCEPTIONS = [
  "src/lib/search/conversation-search-index.ts",
  "src/lib/search/conversation-search-query.ts",
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

  it("never uses the *Unsafe raw-SQL APIs in production code, except the two named conversation-search files", () => {
    const offenders = sources.filter((path) =>
      codeLines(path).some((line) => /\$(?:execute|query)RawUnsafe\b/.test(line)),
    );
    expect(offenders.map(relativePath).filter((path) => !UNSAFE_API_EXCEPTIONS.includes(path))).toEqual([]);
  });

  it("keeps the exceptions honest: each still uses the API, and the conversation-search contract pins it", () => {
    // The two files take their SQL client as a parameter (so their tests can run on a plain client) and ask for the
    // positional-parameter form: values are always bound, the only text built is a run of "?" placeholders. The
    // contract test pins both facts file by file; an exception that no longer needs the API must be removed here.
    const contract = readFileSync(join(ROOT, "src/lib/search/__tests__/conversation-search-raw-boundary-contract.test.ts"), "utf8");
    for (const path of UNSAFE_API_EXCEPTIONS) {
      expect(
        codeLines(join(ROOT, path)).some((line) => /\$(?:execute|query)RawUnsafe\b/.test(line)),
        `${path} no longer uses the Unsafe API: remove it from UNSAFE_API_EXCEPTIONS`,
      ).toBe(true);
      expect(contract, `${path} is not pinned by the raw-boundary contract`).toContain(`"${path}"`);
    }
  });

  it("pins the files that contain $executeRaw writes", () => {
    const writers = sources
      .filter((path) => codeLines(path).some((line) => /\$executeRaw\b/.test(line)))
      .map(relativePath)
      .sort();
    expect(writers).toEqual([...PINNED_RAW_WRITE_FILES].sort());
  });
});
