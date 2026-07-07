/**
 * Machine ID generation.
 *
 * In production (Tauri): uses real hardware fingerprints (CPU, motherboard,
 * disk, MAC, OS GUID) via Tauri system-info APIs.
 *
 * In development (browser): uses a browser fingerprint stored in localStorage.
 * This is NOT secure — it's just for dev/testing. The real implementation
 * comes when the Tauri shell is compiled.
 */

import { isTauriEnv } from "@/lib/env";

const MACHINE_ID_KEY = "sahelflow-machine-id";

/**
 * Get the current machine ID.
 * - In Tauri: queries hardware (TODO: implement when Tauri shell is compiled)
 * - In browser: reads/creates a UUID stored in localStorage
 */
export async function getMachineId(): Promise<string> {
  // Check if running in Tauri (T-S1: use __TAURI_INTERNALS__, not __TAURI__)
  if (isTauriEnv()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const realId = await invoke<string>("get_machine_id");
      if (realId && realId !== "DEV-MOCK-MACHINE-ID-FALLBACK") {
        return realId;
      }
      // T-P4: in release builds, lib.rs returns "" when no native machine
      // ID could be obtained (was previously the publicly-known
      // "DEV-MOCK-MACHINE-ID-FALLBACK" sentinel). Fail-closed in production:
      // throw so the license service can detect "no machine ID" and refuse
      // to issue/validate licenses tied to a specific machine. In dev, fall
      // through to the localStorage UUID for convenience.
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Could not determine machine ID from the OS — license enforcement" +
            " is unavailable. Refusing to fall back to a browser UUID in" +
            " production (would allow trivial license bypass via localStorage" +
            " clearing).",
        );
      }
    } catch (err) {
      // Re-throw production fail-closed errors so callers see them.
      if (process.env.NODE_ENV === "production" && err instanceof Error && err.message.includes("machine ID")) {
        throw err;
      }
      console.warn("Failed to invoke Tauri get_machine_id, falling back to browser ID:", err);
    }
  }

  // Browser/dev mode: use localStorage
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    let id = window.localStorage.getItem(MACHINE_ID_KEY);
    if (!id) {
      // Generate a random ID (crypto.randomUUID if available, else fallback)
      id = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(MACHINE_ID_KEY, id);
    }
    return id;
  }

  // Server-side (SSR): return a placeholder
  return "ssr-placeholder";
}

/**
 * Get a short display version of the machine ID (first 8 chars).
 */
export function shortMachineId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
