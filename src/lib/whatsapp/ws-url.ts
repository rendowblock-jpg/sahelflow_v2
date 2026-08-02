export interface WhatsAppWebSocketConnection {
  url: string;
  expiresAt: number;
}

export function getWhatsAppWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WHATSAPP_WS_URL) {
    return process.env.NEXT_PUBLIC_WHATSAPP_WS_URL;
  }
  if (typeof window === "undefined") {
    return "ws://localhost:3001/ws";
  }
  const { protocol, hostname, host } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "ws://localhost:3001/ws";
  }
  const wsProto = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${host}/ws?XTransformPort=3001`;
}

/**
 * Fetch a short-lived push-only grant and its exact expiry. Callers renew before
 * expiry so the active stream remains continuous without exposing the REST token.
 */
export async function getWhatsAppWsConnection(): Promise<WhatsAppWebSocketConnection | null> {
  if (process.env.NEXT_PUBLIC_WHATSAPP_WS_URL) {
    return {
      url: process.env.NEXT_PUBLIC_WHATSAPP_WS_URL,
      expiresAt: Date.now() + 30_000,
    };
  }
  try {
    const response = await fetch("/api/whatsapp/ws-token", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      token?: string | null;
      expiresAt?: number;
      wsUrl?: string;
    };
    if (!data.token || !Number.isSafeInteger(data.expiresAt)) return null;
    const baseUrl = data.wsUrl ?? getWhatsAppWsUrl();
    const separator = baseUrl.includes("?") ? "&" : "?";
    return {
      url: `${baseUrl}${separator}token=${encodeURIComponent(data.token)}`,
      expiresAt: data.expiresAt!,
    };
  } catch {
    return null;
  }
}

/** Backward-compatible URL-only helper. */
export async function getWhatsAppWsUrlWithToken(): Promise<string | null> {
  return (await getWhatsAppWsConnection())?.url ?? null;
}
