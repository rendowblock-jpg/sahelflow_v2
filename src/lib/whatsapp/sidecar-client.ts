import "server-only";

import { readFileSync } from "node:fs";

import { env } from "@/lib/env";
import {
  createSidecarWebSocketGrant,
  SIDECAR_WS_GRANT_TTL_MS,
} from "../../../sidecars/whatsapp/auth-tokens";
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

function authorizedHeaders(init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (SIDECAR_REST_TOKEN) {
    headers.Authorization = `Bearer ${SIDECAR_REST_TOKEN}`;
  }
  return headers;
}

function throwTransportError(error: unknown): never {
  if (error instanceof SidecarRequestError) throw error;
  if (error instanceof SidecarUnavailableError) throw error;
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
}

async function requireSuccessfulResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
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

async function sidecarRequest(
  path: string,
  init?: RequestInit,
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await requireSuccessfulResponse(
      await fetch(`${SIDECAR_URL}${path}`, {
        ...init,
        headers: authorizedHeaders(init),
        signal: controller.signal,
      }),
    );
  } catch (error) {
    return throwTransportError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Streaming requests keep their abort authority alive until EOF/cancel rather
 * than clearing it as soon as response headers arrive. This prevents a stalled
 * provider media body from monopolizing the single durable WhatsApp worker.
 */
async function sidecarStreamingRequest(
  path: string,
  init?: RequestInit,
  timeoutMs = 120_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeoutId);
  };

  try {
    const response = await requireSuccessfulResponse(
      await fetch(`${SIDECAR_URL}${path}`, {
        ...init,
        headers: authorizedHeaders(init),
        signal: controller.signal,
      }),
    );
    if (!response.body) {
      finish();
      return response;
    }

    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const next = await reader.read();
          if (next.done) {
            finish();
            streamController.close();
            return;
          }
          streamController.enqueue(next.value);
        } catch (error) {
          finish();
          try {
            throwTransportError(error);
          } catch (mapped) {
            streamController.error(mapped);
          }
        }
      },
      async cancel(reason) {
        finish();
        controller.abort();
        await reader.cancel(reason).catch(() => undefined);
      },
    });

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    finish();
    return throwTransportError(error);
  }
}

async function sidecarFetch<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 8000,
): Promise<T> {
  return (await sidecarRequest(path, init, timeoutMs).then((response) =>
    response.json(),
  )) as T;
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

  /**
   * Dispatch one already-authenticated local image to the loopback sidecar.
   * Bytes exist only in bounded process memory for this provider call; they are
   * never converted to base64, written to a loose plaintext file or exposed to
   * the browser as a provider/storage identifier.
   */
  sendImage: (
    to: string,
    image: Buffer,
    mediaType: string,
    caption: string,
    effectKey: string,
    requestBinding: string,
  ) => {
    const form = new FormData();
    form.set("to", to);
    form.set("effectKey", effectKey);
    form.set("requestBinding", requestBinding);
    form.set("caption", caption);
    form.set(
      "image",
      new Blob([new Uint8Array(image)], { type: mediaType }),
      "image",
    );
    return sidecarFetch<{ ok: boolean; id: string; status: string }>(
      "/send-image",
      { method: "POST", body: form },
      120_000,
    );
  },

  /** Dispatch one authenticated staged MP4 through the loopback sidecar. */
  sendVideo: (
    to: string,
    video: Buffer,
    mediaType: string,
    caption: string,
    effectKey: string,
    requestBinding: string,
  ) => {
    const form = new FormData();
    form.set("to", to);
    form.set("effectKey", effectKey);
    form.set("requestBinding", requestBinding);
    form.set("caption", caption);
    form.set(
      "video",
      new Blob([new Uint8Array(video)], { type: mediaType }),
      "video.mp4",
    );
    return sidecarFetch<{ ok: boolean; id: string; status: string }>(
      "/send-video",
      { method: "POST", body: form },
      180_000,
    );
  },

  /**
   * Dispatch one authenticated staged document through the loopback sidecar.
   * The media type is the sniffed classification from the encrypted storage
   * authority; the recipient-visible title travels as the bounded file name.
   */
  sendDocument: (
    to: string,
    document: Buffer,
    mediaType: string,
    fileName: string,
    caption: string,
    effectKey: string,
    requestBinding: string,
  ) => {
    const form = new FormData();
    form.set("to", to);
    form.set("effectKey", effectKey);
    form.set("requestBinding", requestBinding);
    form.set("caption", caption);
    form.set("fileName", fileName);
    form.set(
      "document",
      new Blob([new Uint8Array(document)], { type: mediaType }),
      "document",
    );
    return sidecarFetch<{ ok: boolean; id: string; status: string }>(
      "/send-document",
      { method: "POST", body: form },
      180_000,
    );
  },

  receipt: async (
    effectKey: string,
    requestBinding: string,
  ): Promise<{ ok: boolean; id: string; status: string } | null> => {
    const result = await sidecarFetch<{
      receipt: { id: string; status: string } | null;
    }>(
      "/send-receipt",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effectKey, requestBinding }),
      },
      3000,
    );
    return result.receipt ? { ok: true, ...result.receipt } : null;
  },

  /**
   * Private authenticated media read. Raw provider retrieval fields travel only
   * over loopback for this request and are never returned to a browser or stored
   * in the durable media-fetch outbox. The 120-second authority remains active
   * through complete response-body consumption.
   */
  downloadMedia: (message: IncomingMessage) =>
    sidecarStreamingRequest("/media/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
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

  wsGrantBundle: (
    subject: string,
  ): { token: string; expiresAt: number } | undefined => {
    if (!SIDECAR_REST_TOKEN) return undefined;
    const issuedAt = Date.now();
    return {
      token: createSidecarWebSocketGrant(
        SIDECAR_REST_TOKEN,
        subject,
        issuedAt,
        SIDECAR_WS_GRANT_TTL_MS,
      ),
      expiresAt: issuedAt + SIDECAR_WS_GRANT_TTL_MS,
    };
  },
};
