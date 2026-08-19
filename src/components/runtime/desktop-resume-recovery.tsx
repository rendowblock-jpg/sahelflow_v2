"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isTauri } from "@tauri-apps/api/core";

import {
  DESKTOP_RUNTIME_RECOVERED_EVENT,
  isDesktopResumeGap,
  readRequestedLocaleCookie,
} from "@/lib/runtime/desktop-recovery";
import { useUIStore } from "@/stores/ui-store";

const HEARTBEAT_MS = 15_000;
const HEALTH_ATTEMPTS = 5;
const HEALTH_TIMEOUT_MS = 2_000;
const HEALTH_RETRY_BASE_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function localRuntimeHealthy(): Promise<boolean> {
  for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/health?resume=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) return true;
    } catch {
      // The bundled Next process/database can need a short moment after Windows
      // resumes. The retry budget below is deliberately local and bounded.
    } finally {
      window.clearTimeout(timeout);
    }

    if (attempt < HEALTH_ATTEMPTS - 1) {
      await delay(HEALTH_RETRY_BASE_MS * (attempt + 1));
    }
  }
  return false;
}

/**
 * Reconciles the hydrated desktop after a real Windows sleep/resume gap.
 *
 * Browser focus changes are not enough to trigger recovery; the wall-clock gap
 * must exceed the resume threshold (or the page must return from bfcache). On a
 * genuine resume we restore the cookie-backed locale/document direction, wait
 * for the bundled local runtime + SQLite authority to answer its health probe,
 * then refresh the current RSC tree and ask any visible page error boundary to
 * retry. The seller never has to discover that manual Refresh is the repair.
 */
export function DesktopResumeRecovery() {
  const router = useRouter();
  const recovering = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let lastTick = Date.now();

    const recover = async () => {
      if (disposed || recovering.current) return;
      recovering.current = true;

      try {
        const requestedLocale = readRequestedLocaleCookie();
        if (requestedLocale) {
          useUIStore.getState().setLocale(requestedLocale);
        }

        if (!(await localRuntimeHealthy()) || disposed) return;

        router.refresh();
        window.dispatchEvent(new Event(DESKTOP_RUNTIME_RECOVERED_EVENT));
      } finally {
        recovering.current = false;
        lastTick = Date.now();
      }
    };

    const observeClock = () => {
      const now = Date.now();
      const resumed = isDesktopResumeGap(lastTick, now);
      lastTick = now;
      if (resumed) void recover();
    };

    const interval = window.setInterval(observeClock, HEARTBEAT_MS);
    const onFocus = () => observeClock();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") observeClock();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void recover();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
