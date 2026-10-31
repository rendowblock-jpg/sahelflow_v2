"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Browsers report `false` only when the device knows it has no network at all. "true" can still mean a dead
// connection, which is why every request keeps its own error state; this hook only tells the page when to stop
// offering writes that cannot work.
function getSnapshot(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

// The server cannot know, and a first paint that says "offline" would flash a banner at every sign-in.
function getServerSnapshot(): boolean {
  return true;
}

/** True while the device has a network. Reads the browser flag and its two events; it never polls. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
