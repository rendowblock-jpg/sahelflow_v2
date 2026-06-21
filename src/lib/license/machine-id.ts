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

const MACHINE_ID_KEY = "sahelflow-machine-id";

/**
 * Get the current machine ID.
 * - In Tauri: queries hardware (TODO: implement when Tauri shell is compiled)
 * - In browser: reads/creates a UUID stored in localStorage
 */
export async function getMachineId(): Promise<string> {
  // Check if running in Tauri
  if (typeof window !== "undefined" && "__TAURI__" in window) {
    // TODO: Use Tauri system-info API to get real hardware fingerprint
    // For now, fall through to browser implementation
  }

  // Browser/dev mode: use localStorage
  if (typeof localStorage !== "undefined") {
    let id = localStorage.getItem(MACHINE_ID_KEY);
    if (!id) {
      // Generate a random ID (crypto.randomUUID if available, else fallback)
      id = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(MACHINE_ID_KEY, id);
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
