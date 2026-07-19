import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  relaunch: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ isTauriEnv: () => true }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("swr", () => ({ mutate: mocks.mutate }));

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

describe("shop switch client state", () => {
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "pending",
            processShopId: "shop-a",
            requestedShopId: "shop-b",
            relaunchRequired: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  it("keeps the old shop active while relaunch is delayed and blocks on failure", async () => {
    let rejectRelaunch!: (error: Error) => void;
    mocks.relaunch.mockImplementation(
      () => new Promise((_, reject) => {
        rejectRelaunch = reject;
      }),
    );

    const switching = useShopStore.getState().setActiveShop("shop-b");
    await vi.waitFor(() => expect(mocks.relaunch).toHaveBeenCalledOnce());

    expect(useShopStore.getState()).toMatchObject({
      activeShopId: "shop-a",
      switchStatus: "pending",
      switchTargetId: "shop-b",
    });

    rejectRelaunch(new Error("relaunch failed"));
    await expect(switching).rejects.toThrow("relaunch failed");
    expect(useShopStore.getState()).toMatchObject({
      activeShopId: "shop-a",
      switchStatus: "blocked",
      switchTargetId: "shop-b",
      switchError: "relaunch failed",
    });
  });
});
