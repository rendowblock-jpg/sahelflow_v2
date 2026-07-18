/**
 * Shop store — multi-shop management state.
 *
 * Backed by /api/shops (which reads/writes data/app-meta.json + manages the
 * per-shop SQLite files). The store loads the shop list on mount and syncs
 * mutations back to the API.
 */
import { create } from "zustand";
import { mutate } from "swr";
import { isTauriEnv } from "@/lib/env";

export interface Shop {
  id: string;
  name: string;
  /** Controlled database file identity within the canonical shops directory. */
  databaseFile: string;
  /** Emoji icon (nullable). */
  icon: string | null;
  createdAt: string;
}

interface ShopState {
  shops: Shop[];
  activeShopId: string | null;
  loaded: boolean;

  /** Load the shop list + active shop ID from the API. Call on app mount. */
  loadShops: () => Promise<void>;
  /** Create a new shop (calls POST /api/shops). Returns the created shop. */
  createShop: (input: { name: string; icon?: string | null }) => Promise<Shop>;
  /** Delete a shop (calls DELETE /api/shops/[id]). */
  removeShop: (shopId: string) => Promise<void>;
  /** Set the active shop (calls PUT /api/shops/active). */
  setActiveShop: (shopId: string) => Promise<void>;
  /** Get the active shop (synchronous, from store state). */
  getActiveShop: () => Shop | null;
}

export const useShopStore = create<ShopState>((set, get) => ({
  shops: [],
  activeShopId: null,
  loaded: false,

  loadShops: async () => {
    try {
      const res = await fetch("/api/shops");
      if (!res.ok) return;
      const data = (await res.json()) as { shops: Shop[]; activeShopId: string | null };
      set({ shops: data.shops, activeShopId: data.activeShopId, loaded: true });
    } catch {
      // leave the store empty — the UI shows a loading state
    }
  },

  createShop: async (input) => {
    const res = await fetch("/api/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Échec de la création de la boutique");
    }
    const { shop } = (await res.json()) as { shop: Shop };
    set((s) => ({ shops: [...s.shops, shop] }));
    await mutate(() => true, undefined, { revalidate: false });
    if (isTauriEnv()) {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    }
    return shop;
  },

  removeShop: async (shopId) => {
    const res = await fetch(`/api/shops/${shopId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Échec de la suppression");
    }
    set((s) => {
      const shops = s.shops.filter((shop) => shop.id !== shopId);
      const activeShopId =
        s.activeShopId === shopId ? shops[0]?.id ?? null : s.activeShopId;
      return { shops, activeShopId };
    });
    await mutate(() => true, undefined, { revalidate: false });
    if (isTauriEnv()) {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    }
  },

  setActiveShop: async (shopId) => {
    const res = await fetch("/api/shops/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Échec du changement de boutique");
    }

    set({ activeShopId: shopId });
    await mutate(() => true, undefined, { revalidate: false });
    if (isTauriEnv()) {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } else if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  },

  getActiveShop: () => {
    const { shops, activeShopId } = get();
    return shops.find((shop) => shop.id === activeShopId) ?? null;
  },
}));
