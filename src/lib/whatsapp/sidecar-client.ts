import "server-only";

import { readFileSync } from "node:fs";

import { env } from "@/lib/env";
import { createSidecarWebSocketGrant } from "../../../sidecars/whatsapp/auth-tokens";
import type {
  IncomingMessage,
  SidecarChat,
  SidecarStatus,
} from "./types";

const SIDECAR_URL = env.whatsappSidecarUrl ?? "http://localhost:3001";
const SIDECAR_TOKEN_FILE =
  env.sidecarTokenFile ?? "/tmp/sahelflow-sidecar-token";

function resolveSidecarRestToken(): string | undefined {
  const fromEnv = env.sidecarToken;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  try {
    const fromFile = readFileSync(SIDECAR_TOKEN_FILE, "utf8").trim();
    if (fromFile.length >= 16) return fromFile;
  } catch {
    // Sidecar may not have started yet.
  }
  return undefined;
}

const SIDECAR_REST_TOKEN = resolveSidecarRestToken();

export class SidecarUnavailableError extends Error {
  constructor(
    message: string,
    public readonly ambiguous = true,
  ) {
    super(message);
    this.name = "SidecarUnavailableError";
  }
}

export class SidecarRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly ambiguous: boolean,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SidecarRequestError";
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
    if (SIDECAR_REST_TOKEN) {
      headers.Authorization = `Bearer ${SIDECAR_REST_TOKEN}`;
    }
    const response = await fetch(`${SIDECAR_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        code?: string;
        retryable?: boolean;
        ambiguous?: boolean;
      };
      throw new SidecarRequestError(
        body.error ?? body.message ?? `Sidecar HTTP ${response.status}`,
        body.code ?? "SIDECAR_REJECTED",
        body.retryable === true,
        body.ambiguous !== false,
        response.status,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof SidecarRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SidecarUnavailableError("Sidecar request timed out", true);
    }
    if (
      error instanceof TypeError ||
      (error instanceof Error && /fetch failed|ECONNREFUSED/i.test(error.message))
    ) {
      const causeCode =
        error instanceof Error &&
        "cause" in error &&
        error.cause &&
        typeof error.cause === "object" &&
        "code" in error.cause
          ? String((error.cause as { code?: unknown }).code ?? "")
          : "";
      throw new SidecarUnavailableError(
        "WhatsApp sidecar is not reachable",
        causeCode !== "ECONNREFUSED",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const sidecar = {
  status: () => sidecarFetch<SidecarStatus>("/status"),

  qr: () =>
    sidecarFetch<{ qr: string | null }>("/qr").catch((error) => {
      if (error instanceof SidecarUnavailableError) return { qr: null };
      throw error;
    }),

  chats: (limit = 50) =>
    sidecarFetch<{ chats: SidecarChat[] }>(`/chats?limit=${limit}`),

  messages: (jid: string, limit = 100) =>
    sidecarFetch<{ jid: string; messages: IncomingMessage[] }>(
      `/chats/${encodeURIComponent(jid)}/messages?limit=${limit}`,
    ),

  send: (
    to: string,
    text: string,
    effectKey?: string,
    requestBinding?: string,
  ) =>
    sidecarFetch<{ ok: boolean; id: string; status: string }>("/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        effectKey && requestBinding
          ? { to, text, effectKey, requestBinding }
          : { to, text },
      ),
    }),

  connect: () =>
    sidecarFetch<{ ok: boolean } & SidecarStatus>("/connect", {
      method: "POST",
    }),

  logout: () =>
    sidecarFetch<{ ok: boolean; message: string }>("/logout", {
      method: "DELETE",
    }),

  /** Private server-to-sidecar REST credential. Never return this to a browser. */
  restToken: (): string | undefined => SIDECAR_REST_TOKEN,

  /** Issue a short-lived push-only WebSocket grant for one trusted subject. */
  wsGrant: (subject: string): string | undefined =>
    SIDECAR_REST_TOKEN
      ? createSidecarWebSocketGrant(SIDECAR_REST_TOKEN, subject)
      : undefined,
};
