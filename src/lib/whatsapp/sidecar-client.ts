/**
 * Server-side client for the WhatsApp sidecar.
 *
 * Used by /api/whatsapp/* routes to proxy requests to the sidecar (running on
 * localhost:3001). Centralizes the base URL + auth + error handling so routes
 * stay thin. The browser never talks to the sidecar directly over REST (single
 * origin); only the WebSocket goes direct (for low-latency push).
 *
 * Auth: the sidecar requires `Authorization: Bearer <SIDECAR_TOKEN>` on every
 * REST call and `?token=<SIDECAR_TOKEN>` on the WS upgrade. The token is read
 * from the SIDECAR_TOKEN env var. If not set, the sidecar will have generated
 * one and written it to SIDECAR_TOKEN_FILE (default /tmp/sahelflow-sidecar-token,
 * chmod 600) — we read it from there as a dev convenience.
 *
 * SIDECAR_URL: configurable via env (default http://localhost:3001). In Tauri
 * production both processes run on the same host.
 */
import { env } from "@/lib/env";
import "server-only";


import { readFileSync } from "node:fs";
import type {
  SidecarStatus,
  SidecarChat,
  IncomingMessage,
} from "./types";

const SIDECAR_URL =
  env.whatsappSidecarUrl ?? "http://localhost:3001";

const SIDECAR_TOKEN_FILE =
  env.sidecarTokenFile ?? "/tmp/sahelflow-sidecar-token";

/**
 * Resolve the bearer token to authenticate to the sidecar.
 * Priority: SIDECAR_TOKEN env var > contents of SIDECAR_TOKEN_FILE.
 * Returns undefined if neither is available — the sidecar will reject with 401.
 */
function resolveSidecarToken(): string | undefined {
  const fromEnv = env.sidecarToken;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  try {
    const fromFile = readFileSync(SIDECAR_TOKEN_FILE, "utf8").trim();
    if (fromFile.length >= 16) return fromFile;
  } catch {
    // File doesn't exist or unreadable — token only set via env
  }
  return undefined;
}

const SIDECAR_TOKEN = resolveSidecarToken();

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
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (SIDECAR_TOKEN) {
      headers["Authorization"] = `Bearer ${SIDECAR_TOKEN}`;
    }
    const res = await fetch(`${SIDECAR_URL}${path}`, {
      ...init,
      headers,
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

  /** The bearer token to pass as ?token= on the WS upgrade URL (browser side). */
  wsToken: (): string | undefined => SIDECAR_TOKEN,
};
