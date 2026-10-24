"use client";

import { useSyncExternalStore } from "react";

import { CHART_MOTION_MS } from "@/lib/motion/tokens";

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
  // Do not SSR an animated analytical surface. Hydration may enable the short
  // governed animation after the user's motion preference becomes observable.
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
    fastDuration: reducedMotion ? 0 : CHART_MOTION_MS.update,
    baseDuration: reducedMotion ? 0 : CHART_MOTION_MS.firstDraw,
  } as const;
}
