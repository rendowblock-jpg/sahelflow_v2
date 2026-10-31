/**
 * NEW-AI-STOCK-REFUSAL-NO-HOLDERS: when an AI stock action is refused because an
 * active reservation governs the stock, the message names the orders holding it
 * (the same wording the catalog service uses), instead of a bare copy.
 */
import { describe, expect, it } from "vitest";

import { assertCatalogStockMutationAllowed } from "../executor";

function fakeTx(options: { reserved: boolean; named?: string[]; holders?: number }) {
  const calls: string[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      calls.push(sql);
      if (sql.includes("COUNT(DISTINCT")) return [{ holders: options.holders ?? 0 }];
      if (sql.includes("DISTINCT o.")) return (options.named ?? []).map((orderNumber) => ({ orderNumber }));
      return options.reserved ? [{ present: 1 }] : [];
    },
    orderItem: { findMany: async () => [] },
  };
  return { tx: tx as never, calls };
}

describe("AI stock refusal names the orders that hold the stock", () => {
  it("names one holder", async () => {
    const { tx } = fakeTx({ reserved: true, named: ["SF-10428"], holders: 1 });
    const error = await assertCatalogStockMutationAllowed(tx, "p1").catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "CANONICAL_STOCK_ADJUSTMENT_REQUIRED" });
    expect((error as Error).message).toBe(
      "Product stock is governed by an active inventory reservation (held by order SF-10428)",
    );
  });

  it("names several holders and counts the rest", async () => {
    const { tx } = fakeTx({ reserved: true, named: ["SF-1", "SF-2"], holders: 5 });
    const error = await assertCatalogStockMutationAllowed(tx, "p1").catch((e: unknown) => e);
    expect((error as Error).message).toBe(
      "Product stock is governed by an active inventory reservation (held by orders SF-1, SF-2 and 3 more)",
    );
  });

  it("keeps the plain message when no holder can be named", async () => {
    const { tx } = fakeTx({ reserved: true, named: [], holders: 0 });
    const error = await assertCatalogStockMutationAllowed(tx, "p1").catch((e: unknown) => e);
    expect((error as Error).message).toBe("Product stock is governed by an active inventory reservation");
  });

  it("does not refuse when nothing is reserved", async () => {
    const { tx } = fakeTx({ reserved: false });
    await expect(assertCatalogStockMutationAllowed(tx, "p1")).resolves.toBeUndefined();
  });
});
