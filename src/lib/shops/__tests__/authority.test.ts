import { describe, expect, it } from "vitest";
import type { ShopContext } from "../context";
import { assertShopAuthorityMatches } from "../authority";

const context: ShopContext = Object.freeze({
  shopId: "shop-a",
  registryRevision: 7,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "a".repeat(64),
});

function registry(overrides: Record<string, unknown> = {}) {
  return {
    revision: 7,
    activeShopId: "shop-a",
    shops: [
      { id: "shop-a", databaseFile: "shop-a.db" },
      { id: "shop-b", databaseFile: "shop-b.db" },
    ],
    ...overrides,
  };
}

describe("process shop authority", () => {
  it("rejects a stale registry revision", () => {
    expect(() =>
      assertShopAuthorityMatches(context, registry({ revision: 8 })),
    ).toThrowError(expect.objectContaining({ code: "SHOP_CONTEXT_STALE" }));
  });

  it("rejects a different active shop", () => {
    expect(() =>
      assertShopAuthorityMatches(context, registry({ activeShopId: "shop-b" })),
    ).toThrowError(expect.objectContaining({ code: "SHOP_CONTEXT_STALE" }));
  });
});
