import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source contract: every list hook that carries the shared search (`q`) keeps the previous rows while
 * the answer for a new query loads. The behaviour itself is proven on orders in
 * use-orders-keeps-rows.render.test.tsx; products and customers use the same one-line option.
 */
describe("list hooks keep their rows while a new search loads", () => {
  it.each(["use-orders", "use-products", "use-customers"])("%s", (hook) => {
    const source = readFileSync(resolve(process.cwd(), `src/hooks/swr/${hook}.ts`), "utf8");
    expect(source).toContain("keepPreviousData: true");
  });
});
