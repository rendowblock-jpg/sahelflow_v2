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
    ]) {
      const source = read(path);
      expect(source).toContain("deriveExistingShopBlindIndex");
      expect(source).not.toContain("deriveBlindIndex");
      expect(source).not.toContain("getMasterKey");
    }
  });
});
