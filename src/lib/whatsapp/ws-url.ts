/**
 * Resolve the WebSocket URL for the WhatsApp sidecar.
 *
 * - `NEXT_PUBLIC_WHATSAPP_WS_URL` env override (explicit config — must already
 *   include the `?token=` query param if the sidecar requires auth).
 * - On the user's dev machine (localhost dev server): `ws://localhost:3001/ws`
 *   (sidecar runs alongside, direct connection).
 * - In the sandbox preview (behind the gateway): the browser connects to its
 *   own host with `?XTransformPort=3001` so the gateway forwards to the sidecar.
 *
 * In Tauri production, set `NEXT_PUBLIC_WHATSAPP_WS_URL` to `ws://localhost:3001/ws`.
 *
 * Auth: the sidecar requires `?token=<SIDECAR_TOKEN>` on the WS upgrade. The
 * token is fetched from `/api/whatsapp/ws-token` (server-side resolution of
 * the shared secret). `getWhatsAppWsUrlWithToken()` is async for this reason.
 * `getWhatsAppWsUrl()` (sync) is kept for backward compatibility but produces
 * a URL WITHOUT the token — the upgrade will 401. Migrate callers to the async
 * version.
 */

export function getWhatsAppWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WHATSAPP_WS_URL) {
    return process.env.NEXT_PUBLIC_WHATSAPP_WS_URL;
  }
  if (typeof window === "undefined") {
    return "ws://localhost:3001/ws";
  }
  const { protocol, hostname, host } = window.location;
  // dev: localhost:3000 → sidecar on localhost:3001 directly
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "ws://localhost:3001/ws";
  }
  // sandbox / gateway: use XTransformPort so the gateway forwards to 3001
  const wsProto = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${host}/ws?XTransformPort=3001`;
}

/**
 * Fetch the WS bearer token from the server, then build the full WS URL with
 * `?token=` appended. Returns null if the token is unavailable (sidecar down
 * or not yet started) — callers should show a "sidecar not ready" state.
 */
export async function getWhatsAppWsUrlWithToken(): Promise<string | null> {
  // If the env override is set, assume it already includes the token (or the
  // sidecar doesn't require auth in that deployment).
  if (process.env.NEXT_PUBLIC_WHATSAPP_WS_URL) {
    return process.env.NEXT_PUBLIC_WHATSAPP_WS_URL;
  }
  try {
    const res = await fetch("/api/whatsapp/ws-token", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string | null; wsUrl?: string };
    if (!data.token) return null;
    const baseUrl = data.wsUrl ?? getWhatsAppWsUrl();
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}token=${encodeURIComponent(data.token)}`;
  } catch {
    return null;
  }
}
