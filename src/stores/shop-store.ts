/**
 * Shop store — native multi-shop lifecycle projection.
 *
 * The browser submits lifecycle intent and renders pending/blocked state. It
 * never mutates the registry, selects a database, or restarts the application.
 * The packaged Rust host owns quiesce, commit, compensation, restart and exact
 * authenticated readiness.
 */
import { create } from "zustand";
import { isTauriEnv } from "@/lib/env";

export interface Shop {
  id: string;
  incarnationId?: string;
  name: string;
  databaseFile: string;
  icon: string | null;
  createdAt: string;
}

export interface ShopArchive {
  archiveId: string;
  status: "archived" | "deleted-rescue";
  shop: Shop & { incarnationId: string };
  archivedAtUnixMs: number;
  sourceRegistryRevision: number;
}

export type NativeLifecycleReceipt = Readonly<{
  operationId: string;
  status: "pending";
  targetShopId?: string;
  targetShopIncarnationId?: string;
}>;

interface ShopState {
  shops: Shop[];
  activeShopId: string | null;
  loaded: boolean;
  switchStatus: "idle" | "pending" | "blocked";
  switchTargetId: string | null;
  switchError: string | null;

  loadShops: () => Promise<void>;
  createShop: (input: {
    name: string;
    icon?: string | null;
  }) => Promise<NativeLifecycleReceipt>;
  renameShop: (shopId: string, name: string) => Promise<NativeLifecycleReceipt>;
  archiveShop: (shopId: string) => Promise<NativeLifecycleReceipt>;
  loadArchives: () => Promise<readonly ShopArchive[]>;
  recoverShop: (archiveId: string) => Promise<NativeLifecycleReceipt>;
  removeShop: (shopId: string) => Promise<NativeLifecycleReceipt>;
  setActiveShop: (shopId: string) => Promise<void>;
  getActiveShop: () => Shop | null;
}

function requireNativeLifecycle(): void {
  if (!isTauriEnv()) {
    throw new Error("Native shop lifecycle is available only in the desktop application");
  }
}

async function lifecycleRequest(
  url: string,
  init: RequestInit,
): Promise<NativeLifecycleReceipt> {
  requireNativeLifecycle();
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as Partial<
    NativeLifecycleReceipt & { error: string }
  >;
  if (!response.ok) {
    throw new Error(data.error || "Native shop lifecycle request was rejected");
  }
  if (data.status !== "pending" || !data.operationId) {
    throw new Error("Native shop lifecycle did not return an authenticated pending receipt");
  }
  return Object.freeze({
    operationId: data.operationId,
    status: "pending" as const,
    ...(data.targetShopId ? { targetShopId: data.targetShopId } : {}),
    ...(data.targetShopIncarnationId
      ? { targetShopIncarnationId: data.targetShopIncarnationId }
      : {}),
  });
}

export const useShopStore = create<ShopState>((set, get) => ({
  shops: [],
  activeShopId: null,
  loaded: false,
  switchStatus: "idle",
  switchTargetId: null,
  switchError: null,

  loadShops: async () => {
    try {
      const response = await fetch("/api/shops");
      if (!response.ok) return;
      const data = (await response.json()) as {
        shops: Shop[];
        activeShopId: string | null;
      };
      set({ shops: data.shops, activeShopId: data.activeShopId, loaded: true });
    } catch {
      // The layout retains its loading state while authority is unavailable.
    }
  },

  createShop: async (input) =>
    lifecycleRequest("/api/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  renameShop: async (shopId, name) =>
    lifecycleRequest(`/api/shops/${shopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  archiveShop: async (shopId) =>
    lifecycleRequest(`/api/shops/${shopId}/archive`, { method: "POST" }),

  loadArchives: async () => {
    const response = await fetch("/api/shops/archives");
    const data = (await response.json().catch(() => ({}))) as {
      archives?: ShopArchive[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "Shop archives are unavailable");
    }
    return Object.freeze([...(data.archives ?? [])]);
  },

  recoverShop: async (archiveId) =>
    lifecycleRequest(`/api/shops/archives/${archiveId}/recover`, {
      method: "POST",
    }),

  removeShop: async (shopId) =>
    lifecycleRequest(`/api/shops/${shopId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationShopId: shopId }),
    }),

  setActiveShop: async (shopId) => {
    if (shopId === get().activeShopId) return;
    set({ switchStatus: "pending", switchTargetId: shopId, switchError: null });
    try {
      await lifecycleRequest("/api/shops/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      // The old process remains authoritative until Rust stops it. The native
      // supervisor replaces this page only after the target runtime is ready.
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Native shop switching was blocked";
      set({ switchStatus: "blocked", switchTargetId: shopId, switchError: message });
      throw error;
    }
  },

  getActiveShop: () => {
    const { shops, activeShopId } = get();
    return shops.find((shop) => shop.id === activeShopId) ?? null;
  },
}));
