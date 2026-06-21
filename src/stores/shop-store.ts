/**
 * Shop store — multi-shop management state.
 * In production, shop list is loaded from app-meta store.
 * For now, stubbed with a single dev shop.
 */
import { create } from "zustand";

export interface Shop {
  id: string;
  name: string;
  /** File path to the shop's SQLite database */
  dbPath: string;
  /** Icon (emoji or null) */
  icon: string | null;
  createdAt: string;
}

interface ShopState {
  shops: Shop[];
  activeShopId: string | null;

  addShop: (shop: Shop) => void;
  removeShop: (shopId: string) => void;
  setActiveShop: (shopId: string) => void;
  getActiveShop: () => Shop | null;
}

export const useShopStore = create<ShopState>((set, get) => ({
  shops: [
    {
      id: "dev-shop",
      name: "Ma Boutique",
      dbPath: "data/shops/dev.db",
      icon: "🏪",
      createdAt: new Date().toISOString(),
    },
  ],
  activeShopId: "dev-shop",

  addShop: (shop) =>
    set((s) => {
      if (s.shops.length >= 10) {
        throw new Error("Maximum 10 shops allowed");
      }
      return { shops: [...s.shops, shop] };
    }),

  removeShop: (shopId) =>
    set((s) => ({
      shops: s.shops.filter((shop) => shop.id !== shopId),
      activeShopId: s.activeShopId === shopId ? s.shops[0]?.id ?? null : s.activeShopId,
    })),

  setActiveShop: (shopId) => set({ activeShopId: shopId }),

  getActiveShop: () => {
    const { shops, activeShopId } = get();
    return shops.find((shop) => shop.id === activeShopId) ?? null;
  },
}));
