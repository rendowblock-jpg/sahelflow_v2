"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createRuntimeHealthMonitor,
  type RuntimeHealthMonitor,
  type RuntimeHealthState,
} from "@/lib/runtime/runtime-health";

const PROBE_TIMEOUT_MS = 4_000;
const INITIAL_STATE: RuntimeHealthState = { status: "ok", failures: 0, retrying: false };

/** One cheap request to the local runtime's own health route. Any failure or timeout is "not healthy". */
export async function probeLocalRuntime(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`/api/health?probe=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Live health of the local runtime for the whole page. `onRecovered` runs once each time a shown banner clears. */
export function useRuntimeHealth(onRecovered?: () => void): {
  state: RuntimeHealthState;
  retry: () => void;
} {
  const [state, setState] = useState<RuntimeHealthState>(INITIAL_STATE);
  const monitorRef = useRef<RuntimeHealthMonitor | null>(null);
  const recoveredRef = useRef(onRecovered);

  useEffect(() => {
    recoveredRef.current = onRecovered;
  }, [onRecovered]);

  useEffect(() => {
    const monitor = createRuntimeHealthMonitor({
      probe: probeLocalRuntime,
      isOnline: () => navigator.onLine !== false,
      isVisible: () => document.visibilityState !== "hidden",
      onRecovered: () => recoveredRef.current?.(),
    });
    monitorRef.current = monitor;
    const unsubscribe = monitor.subscribe(setState);
    const wake = () => monitor.environmentChanged();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    monitor.start();
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", wake);
      unsubscribe();
      monitor.stop();
      monitorRef.current = null;
    };
  }, []);

  const retry = useCallback(() => {
    void monitorRef.current?.retryNow();
  }, []);

  return { state, retry };
}
