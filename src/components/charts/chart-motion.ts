"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return typeof window === "undefined" ? true : window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  // Never SSR motion. Hydration enables one deliberate chart entrance when the
  // installed user's motion preference allows it.
  return true;
}

export function useChartMotion() {
  const reducedMotion = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return {
    reducedMotion,
    isAnimationActive: !reducedMotion,
    fastDuration: reducedMotion ? 0 : 480,
    baseDuration: reducedMotion ? 0 : 680,
  } as const;
}
