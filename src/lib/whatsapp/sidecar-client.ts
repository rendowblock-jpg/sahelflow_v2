/**
 * Server-side client for the WhatsApp sidecar.
 *
 * Used by /api/whatsapp/* routes to proxy requests to the sidecar (running on
 * localhost:3001). Centralizes the base URL + error handling so routes stay
 * thin. The browser never talks to the sidecar directly over REST (single
 * origin); only the WebSocket goes direct (for low-latency push).
 *
 * SIDECAR_URL: configurable via env (default http://localhost:3001). In Tauri
 * production both processes run on the same host.
 */

import type {
  SidecarStatus,
  SidecarChat,
  IncomingMessage,
} from "./types";

const SIDECAR_URL =
  process.env.WHATSAPP_SIDECAR_URL ?? "http://localhost:3001";

/** Custom error so routes can distinguish sidecar-down from sidecar-error. */
export class SidecarUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SidecarUnavailableError";
  }
}

async function sidecarFetch<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 8000,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SIDECAR_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message =
        (body as { error?: string; message?: string }).error ??
        (body as { message?: string }).message ??
        `Sidecar HTTP ${res.status}`;
      return Promise.reject(new Error(message));
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new SidecarUnavailableError("Sidecar request timed out");
    }
    // fetch throws TypeError on connection refused
    if (
      err instanceof TypeError ||
      (err instanceof Error && /fetch failed|ECONNREFUSED/i.test(err.message))
    ) {
      throw new SidecarUnavailableError(
        "Sidecar not reachable. Is `bun run dev` running in sidecars/whatsapp?",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const sidecar = {
  status: () => sidecarFetch<SidecarStatus>("/status"),

  /** The raw QR string (null if none). */
  qr: () =>
    sidecarFetch<{ qr: string | null }>("/qr").catch((e) => {
      if (e instanceof SidecarUnavailableError) return { qr: null };
      throw e;
    }),

  chats: (limit = 50) =>
    sidecarFetch<{ chats: SidecarChat[] }>(`/chats?limit=${limit}`),

  messages: (jid: string, limit = 100) =>
    sidecarFetch<{ jid: string; messages: IncomingMessage[] }>(
      `/chats/${encodeURIComponent(jid)}/messages?limit=${limit}`,
    ),

  send: (to: string, text: string) =>
    sidecarFetch<{ ok: boolean; id: string; status: string }>("/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, text }),
    }),

  connect: () =>
    sidecarFetch<{ ok: boolean } & SidecarStatus>("/connect", { method: "POST" }),

  logout: () =>
    sidecarFetch<{ ok: boolean; message: string }>("/logout", { method: "DELETE" }),
};
