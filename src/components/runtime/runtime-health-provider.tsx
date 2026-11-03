"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { DESKTOP_RUNTIME_RECOVERED_EVENT } from "@/lib/runtime/desktop-recovery";
import type { RuntimeHealthState } from "@/lib/runtime/runtime-health";

import { useRuntimeHealth } from "./use-runtime-health";

export interface RuntimeHealthValue {
  state: RuntimeHealthState;
  retry: () => void;
}

const RuntimeHealthContext = createContext<RuntimeHealthValue | null>(null);

/**
 * The ONE place that watches whether the app's local runtime answers. It is
 * mounted around the whole workspace shell (including the Storefront Studio
 * focus mode, which has no top bar) so the recovery reload still runs there.
 * It draws nothing itself; the top bar's status control reads it.
 */
export function RuntimeHealthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const onRecovered = useCallback(() => {
    // Reload what the failed requests left blank, and let any page error screen retry.
    router.refresh();
    window.dispatchEvent(new Event(DESKTOP_RUNTIME_RECOVERED_EVENT));
  }, [router]);

  const { state, retry } = useRuntimeHealth(onRecovered);
  const value = useMemo(() => ({ state, retry }), [state, retry]);

  return <RuntimeHealthContext.Provider value={value}>{children}</RuntimeHealthContext.Provider>;
}

/** The runtime's health, or null where nothing monitors (tests, pages outside the workspace shell). */
export function useRuntimeHealthStatus(): RuntimeHealthValue | null {
  return useContext(RuntimeHealthContext);
}
