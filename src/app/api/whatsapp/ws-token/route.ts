import { NextResponse } from "next/server";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/ws-token — returns the bearer token the browser needs to
 * authenticate the WebSocket upgrade to the sidecar (ws://localhost:3001/ws?token=...).
 *
 * The browser cannot read process.env or the token file directly, so it fetches
 * the token from this server-side route. The token is then appended as a query
 * parameter to the WS URL by `getWhatsAppWsUrl()`.
 *
 * Threat model: any same-origin web page can call this endpoint and read the
 * token. This is acceptable because:
 *   - In Tauri production, the webview has a fixed origin (tauri://localhost)
 *     and only loads app content — no random web pages can be opened.
 *   - In dev (localhost:3000), the developer is presumably not browsing
 *     malicious sites in the same browser session.
 *   - The sidecar is bound to 127.0.0.1, so remote attackers cannot connect
 *     even if they obtain the token.
 *   - The token's purpose is to block OTHER LOCAL PROCESSES (malware, other
 *     apps) from connecting to the sidecar without first exploiting the
 *     Next.js server. It is not a defense against compromised browsers.
 *
 * If the token is unavailable (sidecar not started yet, env not set, file
 * unreadable), returns 503 so the client can show a "sidecar not ready" state.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth();
  const token = sidecar.wsToken();
  if (!token) {
    return NextResponse.json(
      { error: "Sidecar token unavailable — is the sidecar running?", token: null },
      { status: 503 },
    );
  }
  const sidecarUrl = process.env.WHATSAPP_SIDECAR_URL ?? "http://127.0.0.1:3001";
  const wsUrl = `${sidecarUrl.replace(/^http/, "ws")}/ws`;
  return NextResponse.json({ token, wsUrl }, {
    headers: { "Cache-Control": "no-store" },
  });
}, "GET /api/whatsapp/ws-token");
