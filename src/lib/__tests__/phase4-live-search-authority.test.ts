import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n?/g, "\n");
}

describe("Phase 4 live blind-index search authority", () => {
  it("uses only the purpose-separated per-shop blind-index authority", () => {
    for (const path of [
      "src/lib/data/extensions/customer-extensions.ts",
      "src/lib/data/extensions/order-extensions.ts",
      "src/lib/data/phone-reputation.ts",
    ]) {
      const source = read(path);
      expect(source).toMatch(/derive(?:Existing)?ShopBlindIndex/);
      expect(source).not.toContain("deriveBlindIndex");
      expect(source).not.toContain("getMasterKey");
    }
  });

  it("does not derive installation-root candidates for direct customer phone lookups", () => {
    const source = read("src/lib/crypto/protected-pii.ts");
    const start = source.indexOf("async function customerPhoneIndexes");
    const end = source.indexOf("async function decryptNested", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const lookupAuthority = source.slice(start, end);
    expect(lookupAuthority).toContain("blindKeyIfPresent");
    expect(lookupAuthority).not.toContain("deriveBlindIndex");
    expect(lookupAuthority).not.toContain("legacyRoot");
  });

  it("converges legacy reputation hashes before runtime readiness", () => {
    const source = read("src/app/api/internal/runtime-ready/route.ts");
    expect(source).toContain("migratePhoneReputationBlindIndexes");
    expect(source).toContain("RUNTIME_PROTECTED_SEARCH_NOT_READY");
  });
});
