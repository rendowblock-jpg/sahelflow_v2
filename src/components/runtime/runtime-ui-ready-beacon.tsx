"use client";

import { useEffect } from "react";
import { RUNTIME_UI_READY_PATH } from "@/lib/runtime-auth";

const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 250;

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
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
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !controller.signal.aborted; attempt += 1) {
        try {
          const response = await fetch(RUNTIME_UI_READY_PATH, {
            method: "POST",
            cache: "no-store",
            credentials: "same-origin",
            headers: { "X-SahelFlow-UI-Ready": "1" },
            signal: controller.signal,
          });
          if (response.ok) return;
        } catch {
          if (controller.signal.aborted) return;
        }
        await delay(RETRY_DELAY_MS, controller.signal);
      }
    })();

    return () => controller.abort();
  }, []);

  return null;
}
