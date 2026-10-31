import { useSyncExternalStore } from "react";

const PHONE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

/** true below the md breakpoint; false on the server so hydration matches. */
export function usePhoneViewport(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
