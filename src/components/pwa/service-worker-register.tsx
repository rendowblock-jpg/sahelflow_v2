"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for PWA installability + offline app shell.
 *
 * Only registers in production (NODE_ENV=production) to avoid caching
 * during development. In dev, the SW would cache stale bundles and make
 * debugging confusing.
 *
 * The SW is served from /sw.js (public/sw.js) and has root scope.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Register after window load to avoid competing with initial page render
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Registration failed — the app still works, just not installable/offline.
          // Log to console for debugging but don't surface to the user.
          console.warn("[PWA] SW registration failed:", err);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null; // renders nothing — just a side-effect component
}
