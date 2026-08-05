import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const shopContext = {
    workspaceId: "10".repeat(16),
    installationId: "20".repeat(16),
    registryRevision: 7,
    shopId: "shop-algiers",
    shopIncarnationId: "30".repeat(16),
    databaseFileId: "shop-algiers.db",
  };
  return {
    shopContext,
    assertProcessShopAuthority: vi.fn(),
    transaction: vi.fn(
      async (operation: (tx: object) => Promise<unknown>) => operation({}),
    ),
  };
});

vi.mock("@/lib/db", () => ({
  dbRaw: { $transaction: mocks.transaction },
  shopContext: mocks.shopContext,
}));

vi.mock("@/lib/shops/authority", () => ({
  assertProcessShopAuthority: mocks.assertProcessShopAuthority,
}));

import { withPrivacyEraseTransaction } from "@/lib/maintenance/privacy-erase-transaction";

beforeEach(() => {
  mocks.assertProcessShopAuthority.mockReset();
  mocks.transaction.mockClear();
});

describe("governed privacy erase transaction", () => {
  it("reasserts the live shop authority before opening the raw transaction", async () => {
    mocks.assertProcessShopAuthority.mockImplementation(() => {
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    await expect(
      withPrivacyEraseTransaction(async () => "erased"),
    ).resolves.toBe("erased");

    expect(mocks.assertProcessShopAuthority).toHaveBeenCalledOnce();
    expect(mocks.assertProcessShopAuthority).toHaveBeenCalledWith(
      mocks.shopContext,
    );
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("does not open the raw transaction when the process authority is stale", async () => {
    mocks.assertProcessShopAuthority.mockImplementation(() => {
      throw new Error("SHOP_CONTEXT_STALE");
    });

    await expect(
      withPrivacyEraseTransaction(async () => "erased"),
    ).rejects.toThrow("SHOP_CONTEXT_STALE");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
