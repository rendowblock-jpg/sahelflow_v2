"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_UI_DENSITY,
  useUIStore,
  type UiDensity,
} from "@/stores/ui-store";

/**
 * Hydration-safe view of the one persisted density authority.
 *
 * Zustand persistence may already know a returning user's localStorage value when
 * client hydration begins, while the server can only render the stable default.
 * `useSyncExternalStore` deliberately exposes that same default as the hydration
 * snapshot, then converges to the persisted store value immediately after mount.
 * Components therefore never hydrate compact markup over comfortable SSR markup,
 * yet tables, shell spacing, Settings and document-root portals still share one
 * live preference after hydration.
 */
export function useUiDensity(): {
  density: UiDensity;
  setDensity: (density: UiDensity) => void;
} {
  const density = useSyncExternalStore(
    useUIStore.subscribe,
    () => useUIStore.getState().density,
    () => DEFAULT_UI_DENSITY,
  );
  const setDensity = useUIStore((state) => state.setDensity);

  return { density, setDensity };
}
