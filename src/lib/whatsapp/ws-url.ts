/**
 * Resolve the WebSocket URL for the WhatsApp sidecar.
 *
 * - `NEXT_PUBLIC_WHATSAPP_WS_URL` env override (explicit config).
 * - On the user's dev machine (localhost dev server): `ws://localhost:3001/ws`
 *   (sidecar runs alongside, direct connection).
 * - In the sandbox preview (behind the gateway): the browser connects to its
 *   own host with `?XTransformPort=3001` so the gateway forwards to the sidecar.
 *
 * In Tauri production, set `NEXT_PUBLIC_WHATSAPP_WS_URL` to `ws://localhost:3001/ws`.
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
