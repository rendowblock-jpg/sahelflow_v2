import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// The widened pass must never become a second way to read records: it reuses
// the strict pass (permissions, shop isolation, degraded reporting), runs only
// when that found nothing, and is skipped on a slow machine.
describe("typo backoff orchestration", () => {
  const server = source("src/lib/search/universal-search-server.ts");
  const exported = server.slice(server.indexOf("export async function searchUniversalRecords("));

  it("is the only exported entry point and wraps the strict pass", () => {
    expect(server.match(/export async function searchUniversalRecords\(/g)).toHaveLength(1);
    expect(server).toContain("async function searchUniversalRecordsStrict(");
    expect(exported).toContain("searchUniversalRecordsStrict(rawQuery, requestedLimit, signal)");
  });

  it("widens only an empty answer, only once per spelling, and re-ranks by closeness", () => {
    expect(exported).toContain("strict.results.length > 0");
    expect(exported).toContain("typoBackoffQueries(strict.query)");
    expect(exported).toContain("fuzzy: true");
    expect(exported).toContain("strict.tookMs > TYPO_BACKOFF_MAX_FIRST_PASS_MS");
    expect(exported).not.toContain("db.");
  });

  it("keeps the strict pass free of loose matching", () => {
    const strict = server.slice(
      server.indexOf("async function searchUniversalRecordsStrict("),
      server.indexOf("// A slow first pass means a slow machine"),
    );
    expect(strict).not.toContain("fuzzy");
    expect(strict).not.toContain("typoBackoffQueries");
  });
});
