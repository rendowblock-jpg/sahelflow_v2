import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ isTauriEnv: () => true }));

import { useShopStore, type Shop } from "../shop-store";

const shops: Shop[] = [
  {
    id: "shop-a",
    name: "Shop A",
    databaseFile: "shop-a.db",
    icon: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "shop-b",
    name: "Shop B",
    databaseFile: "shop-b.db",
    icon: null,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

describe("native shop switch client state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useShopStore.setState({
      shops,
      activeShopId: "shop-a",
      loaded: true,
      switchStatus: "idle",
      switchTargetId: null,
      switchError: null,
    });
  });

  it("keeps old authority active after an authenticated native pending receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "pending",
          operationId: "1".repeat(32),
          targetShopId: "shop-b",
          targetShopIncarnationId: "2".repeat(32),
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await useShopStore.getState().setActiveShop("shop-b");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shops/active",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ shopId: "shop-b" }),
      }),
    );
    expect(useShopStore.getState()).toMatchObject({
      activeShopId: "shop-a",
      switchStatus: "pending",
      switchTargetId: "shop-b",
      switchError: null,
    });
  });

  it("blocks visibly when native lifecycle intent is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "native switch rejected" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      useShopStore.getState().setActiveShop("shop-b"),
    ).rejects.toThrow("native switch rejected");
    expect(useShopStore.getState()).toMatchObject({
      activeShopId: "shop-a",
      switchStatus: "blocked",
      switchTargetId: "shop-b",
      switchError: "native switch rejected",
    });
  });
});
