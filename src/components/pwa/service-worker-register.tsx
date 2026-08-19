"use client";

import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";

const DESKTOP_SW_RETIRE_RELOAD_KEY = "sf-desktop-sw-retired-v1";
const SAHELFLOW_CACHE_PREFIX = "sahelflow-";

async function retireDesktopServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) => registration.scope.startsWith(window.location.origin))
      .map((registration) => registration.unregister()),
  );

  if (typeof caches !== "undefined") {
    const cacheNames = await caches.keys();
    await Promise.allSettled(
      cacheNames
        .filter((name) => name.startsWith(SAHELFLOW_CACHE_PREFIX))
        .map((name) => caches.delete(name)),
    );
  }

  // A client that was already controlled remains attached to the retired worker
  // until its document is replaced. Reload exactly once so upgraded desktop
  // installations leave the old PWA cache boundary instead of carrying stale
  // RSC/static responses into the new signed runtime.
  if (
    navigator.serviceWorker.controller &&
    window.sessionStorage.getItem(DESKTOP_SW_RETIRE_RELOAD_KEY) !== "done"
  ) {
    window.sessionStorage.setItem(DESKTOP_SW_RETIRE_RELOAD_KEY, "done");
    window.location.reload();
  }
}

/**
 * Browser/PWA service-worker ownership.
 *
 * The signed Tauri desktop owns its local runtime, navigation and recovery
 * lifecycle itself. It must never be controlled by the browser PWA service
 * worker: doing so can preserve stale App Router/RSC assets across locale
 * changes, signed updates and long Windows sleep/resume cycles. Existing desktop
 * registrations/caches are retired in place once during migration.
 *
 * Normal browser/PWA sessions keep the worker for static-asset resilience.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;

    if (isTauri()) {
      void retireDesktopServiceWorker().catch((error: unknown) => {
        console.warn("[desktop] service-worker retirement failed:", error);
      });
      return;
    }

    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        .then((registration) => registration.update())
        .catch((error: unknown) => {
          // Browser PWA installability is additive. A failed registration must
          // never block the seller workspace.
          console.warn("[PWA] service-worker registration failed:", error);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
