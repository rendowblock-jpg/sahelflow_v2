import "server-only";

import type { ConnectedEnvelope } from "./protocol";

export class ConnectedPlatformHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`Connected platform request failed (${status}: ${code})`);
    this.name = "ConnectedPlatformHttpError";
  }
}

export type ConnectedTokenProvider = () => Promise<string>;

export type ConnectedPlatformEndpoints = Readonly<{
  control: string;
  storefront: string;
  backup: string;
}>;

export type ConnectedPlatformClientOptions = Readonly<{
  endpoints: ConnectedPlatformEndpoints;
  controlToken: ConnectedTokenProvider;
  backupToken?: ConnectedTokenProvider;
  timeoutMs?: number;
}>;

function normalizedBaseUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} endpoint is invalid`);
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new TypeError(`${label} endpoint must be an origin only`);
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new TypeError(`${label} endpoint must use HTTPS`);
  }
  url.pathname = "/";
  return url;
}

function boundedTimeout(value: number | undefined): number {
  const timeout = value ?? 10_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 60_000) {
    throw new TypeError("Connected platform timeout is invalid");
  }
  return timeout;
}

function pathUrl(base: URL, path: string, query?: Record<string, string | number>): URL {
  if (!path.startsWith("/") || path.includes("..")) {
    throw new TypeError("Connected platform path is invalid");
  }
  const url = new URL(path.slice(1), base);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function errorCode(response: Response): Promise<string> {
  try {
    const parsed = await response.clone().json() as unknown;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const value = (parsed as { error?: unknown }).error;
      if (typeof value === "string" && /^[a-z0-9_]{2,80}$/.test(value)) return value;
    }
  } catch {
    // Never surface arbitrary remote response text in local diagnostics.
  }
  return "remote_request_failed";
}

export class ConnectedPlatformClient {
  private readonly endpoints: Record<keyof ConnectedPlatformEndpoints, URL>;
  private readonly timeoutMs: number;

  constructor(private readonly options: ConnectedPlatformClientOptions) {
    this.endpoints = {
      control: normalizedBaseUrl(options.endpoints.control, "Control-plane"),
      storefront: normalizedBaseUrl(options.endpoints.storefront, "Storefront"),
      backup: normalizedBaseUrl(options.endpoints.backup, "Backup"),
    };
    this.timeoutMs = boundedTimeout(options.timeoutMs);
  }

  private async requestJson<T>(
    service: keyof ConnectedPlatformEndpoints,
    path: string,
    init: Readonly<{
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      query?: Record<string, string | number>;
      token?: "control" | "backup" | "none";
    }> = {},
  ): Promise<T> {
    const tokenKind = init.token ?? "control";
    let authorization: string | null = null;
    if (tokenKind === "control") authorization = await this.options.controlToken();
    if (tokenKind === "backup") {
      if (!this.options.backupToken) throw new Error("Backup authority is not enrolled");
      authorization = await this.options.backupToken();
    }
    if (authorization !== null && (authorization.length < 32 || authorization.length > 256)) {
      throw new Error("Connected platform local token authority is invalid");
    }
    const headers = new Headers({ Accept: "application/json" });
    if (authorization) headers.set("Authorization", `Bearer ${authorization}`);
    let body: string | undefined;
    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.body);
    }
    let response: Response;
    try {
      response = await fetch(pathUrl(this.endpoints[service], path, init.query), {
        method: init.method ?? "GET",
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ConnectedPlatformHttpError(504, "remote_timeout");
      }
      throw new ConnectedPlatformHttpError(503, "remote_unavailable");
    }
    if (!response.ok) {
      throw new ConnectedPlatformHttpError(response.status, await errorCode(response));
    }
    try {
      return await response.json() as T;
    } catch {
      throw new ConnectedPlatformHttpError(502, "invalid_remote_response");
    }
  }

  createPairing(input: { workspaceId: string; memberId: string; deviceId: string }) {
    return this.requestJson<{ pairingId: string; pairingToken: string; expiresAt: string }>(
      "control",
      "/v1/desktop/pairings",
      { method: "POST", body: input },
    );
  }

  listDevices(workspaceId: string) {
    return this.requestJson<{ devices: unknown[] }>("control", "/v1/desktop/devices", {
      query: { workspaceId },
    });
  }

  putProjection(envelope: ConnectedEnvelope) {
    return this.requestJson<{ status: "stored"; sequence: number }>(
      "control",
      "/v1/desktop/projections",
      { method: "PUT", body: envelope },
    );
  }

  pollCommands(workspaceId: string, after: number, limit = 50) {
    return this.requestJson<{
      commands: Array<{ relaySequence: number; commandId: string; envelope: ConnectedEnvelope }>;
      nextCursor: number;
    }>("control", "/v1/desktop/commands", {
      query: { workspaceId, after, limit },
    });
  }

  completeCommand(
    commandId: string,
    state: "committed" | "rejected" | "conflict",
    envelope: ConnectedEnvelope,
  ) {
    return this.requestJson<{ commandId: string; state: string }>(
      "control",
      `/v1/desktop/commands/${encodeURIComponent(commandId)}/result`,
      { method: "POST", body: { state, envelope } },
    );
  }

  createStorefront(input: {
    workspaceId: string;
    storefrontId: string;
    shopId: string;
    slug: string;
    receiptEncryptionPublicKey: string;
  }) {
    return this.requestJson<{ storefrontId: string; status: string }>(
      "storefront",
      "/v1/desktop/storefronts",
      { method: "POST", body: input },
    );
  }

  publishStorefrontRelease(storefrontId: string, input: unknown) {
    return this.requestJson<{ releaseId: string; artifactDigest: string; status: string }>(
      "storefront",
      `/v1/desktop/storefronts/${encodeURIComponent(storefrontId)}/releases`,
      { method: "POST", body: input },
    );
  }

  pollStorefrontReceipts(workspaceId: string, after: number, limit = 50) {
    return this.requestJson<{ receipts: unknown[]; nextCursor: number }>(
      "storefront",
      "/v1/desktop/storefront/receipts",
      { query: { workspaceId, after, limit } },
    );
  }

  completeStorefrontReceipt(
    receiptId: string,
    input: {
      workspaceId: string;
      state: "imported" | "rejected" | "reconciled";
      canonicalOrderRef?: string;
      resultDigest?: string;
    },
  ) {
    return this.requestJson<{ receiptId: string; status: string }>(
      "storefront",
      `/v1/desktop/storefront/receipts/${encodeURIComponent(receiptId)}/result`,
      { method: "POST", body: input },
    );
  }

  initiateBackup(input: unknown) {
    return this.requestJson<{ backupId: string; state: string; totalBytes: number }>(
      "backup",
      "/v1/backups",
      { method: "POST", body: input, token: "backup" },
    );
  }

  listBackups(workspaceId: string, limit = 50) {
    return this.requestJson<{ backups: unknown[] }>("backup", "/v1/backups", {
      query: { workspaceId, limit },
      token: "backup",
    });
  }
}
