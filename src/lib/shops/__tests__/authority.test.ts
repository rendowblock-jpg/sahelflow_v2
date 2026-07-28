import { describe, expect, it } from "vitest";
import type { ShopContext } from "../context";
import { assertShopAuthorityMatches } from "../authority";

const context: ShopContext = Object.freeze({
  workspaceId: "a".repeat(32),
  installationId: "b".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "c".repeat(32),
  registryRevision: 7,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "a".repeat(64),
});

function registry(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 2,
    workspaceId: "a".repeat(32),
    installationId: "b".repeat(32),
    revision: 7,
    activeShopId: "shop-a",
    shops: [
      { id: "shop-a", incarnationId: "c".repeat(32), databaseFile: "shop-a.db" },
      { id: "shop-b", incarnationId: "d".repeat(32), databaseFile: "shop-b.db" },
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

  it("rejects a different workspace, installation, or incarnation", () => {
    expect(() =>
      assertShopAuthorityMatches(context, registry({ workspaceId: "e".repeat(32) })),
    ).toThrowError(expect.objectContaining({ code: "SHOP_CONTEXT_STALE" }));
    expect(() =>
      assertShopAuthorityMatches(context, registry({ installationId: "f".repeat(32) })),
    ).toThrowError(expect.objectContaining({ code: "SHOP_CONTEXT_STALE" }));
    expect(() =>
      assertShopAuthorityMatches(
        context,
        registry({
          shops: [
            { id: "shop-a", incarnationId: "0".repeat(32), databaseFile: "shop-a.db" },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "SHOP_CONTEXT_STALE" }));
  });

  it("rejects an unsupported registry format even when the identity tuple matches", () => {
    expect(() =>
      assertShopAuthorityMatches(context, registry({ formatVersion: 3 })),
    ).toThrowError(expect.objectContaining({ code: "SHOP_REGISTRY_UNAVAILABLE" }));
  });
});
