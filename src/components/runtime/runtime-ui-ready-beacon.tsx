"use client";

import { useEffect } from "react";
import { RUNTIME_UI_READY_PATH } from "@/lib/runtime-auth";

const RETRY_WINDOW_MS = 75_000;
const REQUEST_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 500;

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

/**
 * Proves the packaged desktop WebView loaded and hydrated a real SahelFlow page
 * with its native HttpOnly per-launch runtime cookie. The Rust host keeps the
 * window hidden until the corresponding acknowledgment file is durable.
 */
export function RuntimeUiReadyBeacon() {
  useEffect(() => {
    // Packaged SahelFlow always binds the mandatory server to 127.0.0.1.
    // Browser development uses localhost and must not produce desktop evidence.
    if (window.location.hostname !== "127.0.0.1") return;

    const controller = new AbortController();

    void (async () => {
      const deadline = Date.now() + RETRY_WINDOW_MS;
      while (!controller.signal.aborted && Date.now() < deadline) {
        const requestController = new AbortController();
        const abortRequest = () => requestController.abort();
        controller.signal.addEventListener("abort", abortRequest, { once: true });
        if (controller.signal.aborted) abortRequest();
        const requestTimeout = window.setTimeout(
          () => requestController.abort(),
          REQUEST_TIMEOUT_MS,
        );
        try {
          const response = await fetch(RUNTIME_UI_READY_PATH, {
            method: "POST",
            cache: "no-store",
            credentials: "same-origin",
            headers: { "X-SahelFlow-UI-Ready": "1" },
            signal: requestController.signal,
          });
          if (response.ok) return;
        } catch {
          if (controller.signal.aborted) return;
        } finally {
          window.clearTimeout(requestTimeout);
          controller.signal.removeEventListener("abort", abortRequest);
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) return;
        await delay(Math.min(RETRY_DELAY_MS, remaining), controller.signal);
      }
    })();

    return () => controller.abort();
  }, []);

  return null;
}
