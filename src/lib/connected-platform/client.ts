import "server-only";

import { createHash } from "node:crypto";
import type { ConnectedEnvelope } from "./protocol";

export class ConnectedPlatformHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    /** Seconds the Worker asked us to wait (Retry-After on a 503), when it sent one. */
    public readonly retryAfterSeconds?: number,
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

/** One live phone as the relay lists it (the relay's own snake_case names). */
export type ConnectedRelayDevice = Readonly<{
  device_id: string;
  member_id: string;
  signing_public_key: string;
  encryption_public_key: string;
  revocation_epoch: number;
  last_seen_at: string | null;
  created_at: string;
  revoked_at: string | null;
}>;

export type ConnectedPlatformClientOptions = Readonly<{
  endpoints: ConnectedPlatformEndpoints;
  controlToken: ConnectedTokenProvider;
  backupToken?: ConnectedTokenProvider;
  timeoutMs?: number;
}>;

export type StorefrontAllocationTransfer = Readonly<{
  itemKey: string;
  quantity: number;
}>;

export type StorefrontReceipt = Readonly<{
  relaySequence: number;
  receiptId: string;
  storefrontId: string;
  storefrontSlug: string;
  shopId: string;
  releaseId: string;
  idempotencyKey: string;
  requestDigest: string;
  encryptedCustomer: string;
  wrappedCustomerKey: string;
  wilayaCode: string;
  deliveryMode: "home" | "desk";
  subtotalDzd: number;
  shippingDzd: number;
  totalDzd: number;
  createdAt: string;
  lines: ReadonlyArray<{
    itemKey: string;
    quantity: number;
    unitPriceDzd: number;
  }>;
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

function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get("Retry-After");
  if (raw === null || !/^\d{1,4}$/.test(raw.trim())) return undefined;
  return Number(raw.trim());
}

/** Largest body the storefront Worker accepts per photo width (control-plane/storefront/media.ts). */
const MEDIA_BODY_LIMIT: Readonly<Record<number, number>> = { 640: 160 * 1024, 1280: 600 * 1024 };

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
      throw new ConnectedPlatformHttpError(response.status, await errorCode(response), retryAfterSeconds(response));
    }
    try {
      return await response.json() as T;
    } catch {
      throw new ConnectedPlatformHttpError(502, "invalid_remote_response");
    }
  }

  /** desktopKeyProof: "<signature>.<context>", the desktop's signature over its RSA key (the relay stores and returns it). */
  createPairing(input: { workspaceId: string; memberId: string; deviceId: string; desktopKeyProof?: string }) {
    return this.requestJson<{ pairingId: string; pairingToken: string; expiresAt: string }>(
      "control",
      "/v1/desktop/pairings",
      { method: "POST", body: input },
    );
  }

  listDevices(workspaceId: string) {
    return this.requestJson<{ devices: ConnectedRelayDevice[] }>("control", "/v1/desktop/devices", {
      query: { workspaceId },
    });
  }

  /** Revokes one paired phone. The relay needs the new (higher) revocation epoch. */
  async revokeDevice(deviceId: string, input: { workspaceId: string; revocationEpoch: number }) {
    if (!Number.isSafeInteger(input.revocationEpoch) || input.revocationEpoch < 1) {
      throw new RangeError("Connected device revocation epoch is invalid");
    }
    return this.requestJson<{ deviceId: string; status: "revoked"; revocationEpoch: number }>(
      "control",
      `/v1/desktop/devices/${encodeURIComponent(deviceId)}/revoke`,
      {
        method: "POST",
        body: { workspaceId: input.workspaceId, revocationEpoch: input.revocationEpoch },
      },
    );
  }

  putProjection(envelope: ConnectedEnvelope) {
    return this.requestJson<{ status: "stored"; sequence: number }>(
      "control",
      "/v1/desktop/projections",
      { method: "PUT", body: envelope },
    );
  }

  pollCommands(workspaceId: string, shopId: string, after: number, limit = 50) {
    return this.requestJson<{
      commands: Array<{ relaySequence: number; commandId: string; envelope: ConnectedEnvelope }>;
      nextCursor: number;
      /** Presence, so the caller can pace itself. Absent on an older relay. */
      pairedDevices?: number;
      activeDevices?: number;
    }>("control", "/v1/desktop/commands", {
      query: { workspaceId, shopId, after, limit },
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

  /** Which of these photos (at most 50) the cloud already holds in every size. */
  checkStorefrontMedia(storefrontId: string, input: { workspaceId: string; hashes: string[] }) {
    return this.requestJson<{ origin: string; widths: number[]; present: string[] }>(
      "storefront",
      `/v1/desktop/storefronts/${encodeURIComponent(storefrontId)}/media/check`,
      { method: "POST", body: input },
    );
  }

  /** Sends one WebP of one photo. 200 (already there) and 201 (stored) both succeed. */
  async putStorefrontMedia(
    storefrontId: string,
    hash: string,
    width: number,
    workspaceId: string,
    bytes: Uint8Array,
    sha256: string,
  ): Promise<{ status: "stored" | "exists"; url: string; bytes: number; width: number }> {
    const limit = MEDIA_BODY_LIMIT[width];
    if (!/^[0-9a-f]{24}$/.test(hash) || limit === undefined) throw new TypeError("Connected platform media name is invalid");
    // Refuse an oversized body here: the Worker would only answer 413 after the upload.
    if (bytes.byteLength < 1 || bytes.byteLength > limit) throw new ConnectedPlatformHttpError(413, "media_too_large");
    const authorization = await this.options.controlToken();
    if (authorization.length < 32 || authorization.length > 256) {
      throw new Error("Connected platform local token authority is invalid");
    }
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    let response: Response;
    try {
      response = await fetch(
        pathUrl(this.endpoints.storefront, `/v1/desktop/storefronts/${encodeURIComponent(storefrontId)}/media/${hash}/${width}`, { workspaceId }),
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${authorization}`,
            "Content-Type": "image/webp",
            "X-SahelFlow-SHA256": sha256,
          },
          body,
          cache: "no-store",
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") throw new ConnectedPlatformHttpError(504, "remote_timeout");
      throw new ConnectedPlatformHttpError(503, "remote_unavailable");
    }
    if (!response.ok) {
      throw new ConnectedPlatformHttpError(response.status, await errorCode(response), retryAfterSeconds(response));
    }
    try {
      return await response.json() as { status: "stored" | "exists"; url: string; bytes: number; width: number };
    } catch {
      throw new ConnectedPlatformHttpError(502, "invalid_remote_response");
    }
  }

  publishStorefrontRelease(storefrontId: string, input: unknown) {
    return this.requestJson<{
      storefrontId: string;
      releaseId: string;
      artifactDigest: string;
      allocations: StorefrontAllocationTransfer[];
      retiredAllocations: StorefrontAllocationTransfer[];
      status: "published";
      replay: boolean;
    }>(
      "storefront",
      `/v1/desktop/storefronts/${encodeURIComponent(storefrontId)}/releases`,
      { method: "POST", body: input },
    );
  }

  pauseStorefront(
    storefrontId: string,
    input: { workspaceId: string; operationId: string },
  ) {
    return this.requestJson<{
      storefrontId: string;
      operationId: string;
      sourceReleaseId: string | null;
      retiredAllocations: StorefrontAllocationTransfer[];
      status: "paused";
    }>(
      "storefront",
      `/v1/desktop/storefronts/${encodeURIComponent(storefrontId)}/pause`,
      { method: "POST", body: input },
    );
  }

  private async backupBinaryRequest<T>(
    path: string,
    input: Readonly<{
      method: "PUT";
      workspaceId: string;
      body: Uint8Array;
    }>,
  ): Promise<T> {
    if (!this.options.backupToken) throw new Error("Backup authority is not enrolled");
    if (input.body.byteLength < 1 || input.body.byteLength > 64 * 1024 * 1024) {
      throw new RangeError("Connected backup object size is invalid");
    }
    const authorization = await this.options.backupToken();
    if (authorization.length < 32 || authorization.length > 256) {
      throw new Error("Connected platform local token authority is invalid");
    }
    const body = new Uint8Array(input.body.byteLength);
    body.set(input.body);
    // The backup Worker refuses an object unless the sender states the exact
    // SHA-256 it expects R2 to store (control-plane/backup/r2-integrity.ts).
    // Without this header every cloud backup upload fails with a 409.
    const sha256 = createHash("sha256").update(body).digest("hex");
    let response: Response;
    try {
      response = await fetch(pathUrl(this.endpoints.backup, path, {
        workspaceId: input.workspaceId,
      }), {
        method: input.method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${authorization}`,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(body.byteLength),
          "X-SahelFlow-SHA256": sha256,
        },
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
    try { return await response.json() as T; }
    catch { throw new ConnectedPlatformHttpError(502, "invalid_remote_response"); }
  }

  private async downloadBackupObject(
    path: string,
    workspaceId: string,
    expectedBytes: number,
    expectedSha256: string,
  ): Promise<Uint8Array> {
    if (!this.options.backupToken) throw new Error("Backup authority is not enrolled");
    if (
      !Number.isSafeInteger(expectedBytes) || expectedBytes < 1 ||
      expectedBytes > 64 * 1024 * 1024 || !/^[0-9a-f]{64}$/.test(expectedSha256)
    ) throw new TypeError("Connected backup download authority is invalid");
    const authorization = await this.options.backupToken();
    if (authorization.length < 32 || authorization.length > 256) {
      throw new Error("Connected platform local token authority is invalid");
    }
    let response: Response;
    try {
      response = await fetch(pathUrl(this.endpoints.backup, path, { workspaceId }), {
        headers: { Authorization: `Bearer ${authorization}`, Accept: "application/octet-stream" },
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
    if (
      response.headers.get("X-SahelFlow-SHA256") !== expectedSha256 ||
      Number(response.headers.get("Content-Length")) !== expectedBytes
    ) throw new ConnectedPlatformHttpError(502, "backup_integrity_mismatch");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.byteLength !== expectedBytes ||
      createHash("sha256").update(bytes).digest("hex") !== expectedSha256
    ) throw new ConnectedPlatformHttpError(502, "backup_integrity_mismatch");
    return bytes;
  }

  bootstrapConnected(
    entitlement: unknown,
    desktopSigningPublicKey: string,
    desktopEncryptionPublicKey: string,
    recoveryTransfer = false,
  ) {
    return this.requestJson<{
      workspaceId: string;
      desktopToken: string;
      protocolVersion: number;
      status?: "refreshed" | "recovered";
    }>("control", "/v1/bootstrap", {
      method: "POST",
      token: "none",
      body: { entitlement, desktopSigningPublicKey, desktopEncryptionPublicKey, recoveryTransfer },
    });
  }

  bootstrapBackup(
    entitlement: unknown,
    desktopSigningPublicKey: string,
    recoveryTransfer = false,
  ) {
    return this.requestJson<{
      workspaceId: string;
      backupToken: string;
      backupBytes: number;
      licenseType: "trial" | "extension" | "permanent";
      status?: "refreshed" | "recovered";
    }>("backup", "/v1/bootstrap", {
      method: "POST",
      token: "none",
      body: { entitlement, desktopSigningPublicKey, recoveryTransfer },
    });
  }

  putCommandPolicy(input: {
    workspaceId: string;
    shopId: string;
    memberId: string;
    deviceId: string;
    policyVersion: number;
    memberRevocationEpoch: number;
    deviceRevocationEpoch: number;
    allowedCommands: string[];
    expiresAt: string;
  }) {
    return this.requestJson<{ status: "stored"; policyVersion: number }>(
      "control",
      "/v1/desktop/command-policies",
      { method: "PUT", body: input },
    );
  }

  invalidateMemberCommandPolicies(workspaceId: string, memberId: string) {
    return this.requestJson<{ memberId: string; status: "invalidated" }>(
      "control",
      "/v1/desktop/command-policies",
      { method: "DELETE", body: { workspaceId, memberId } },
    );
  }

  listStorefrontReleases(storefrontId: string, workspaceId: string, limit = 50) {
    return this.requestJson<{
      storefrontId: string;
      releases: Array<{
        releaseId: string;
        parentReleaseId: string | null;
        templateId: import("@/lib/storefront/presentation-types").StorefrontTemplateId;
        locale: "ar" | "fr" | "en";
        artifactDigest: string;
        createdAt: string;
        isActive: boolean;
      }>;
    }>("storefront", `/v1/desktop/storefronts/${encodeURIComponent(storefrontId)}/releases`, {
      query: { workspaceId, limit },
    });
  }

  rollbackStorefrontRelease(
    storefrontId: string,
    input: {
      workspaceId: string;
      sourceReleaseId: string;
      releaseId: string;
      expectedActiveReleaseId: string;
      allocations: Array<{
        itemKey: string;
        unitPriceDzd: number;
        quantity: number;
      }>;
    },
  ) {
    return this.requestJson<{
      storefrontId: string;
      releaseId: string;
      sourceReleaseId: string;
      previousReleaseId: string;
      artifactDigest: string;
      allocations: StorefrontAllocationTransfer[];
      retiredAllocations: StorefrontAllocationTransfer[];
      status: "rolled_back";
      replay: boolean;
    }>("storefront", `/v1/desktop/storefronts/${encodeURIComponent(storefrontId)}/rollback`, {
      method: "POST",
      body: input,
    });
  }

  pollStorefrontReceipts(workspaceId: string, shopId: string, after: number, limit = 50) {
    return this.requestJson<{ receipts: StorefrontReceipt[]; nextCursor: number }>(
      "storefront",
      "/v1/desktop/storefront/receipts",
      { query: { workspaceId, shopId, after, limit } },
    );
  }

  completeStorefrontReceipt(
    receiptId: string,
    input: {
      workspaceId: string;
      shopId: string;
      state: "rejected";
      resultDigest: string;
    } | {
      workspaceId: string;
      shopId: string;
      state: "imported" | "reconciled";
      canonicalOrderRef: string;
      resultDigest: string;
    },
  ) {
    return this.requestJson<{ receiptId: string; status: string }>(
      "storefront",
      `/v1/desktop/storefront/receipts/${encodeURIComponent(receiptId)}/result`,
      { method: "POST", body: input },
    );
  }

  initiateBackup(input: unknown) {
    return this.requestJson<{
      backupId: string;
      state: string;
      totalBytes?: number;
      /** true when the service already held this exact plan and resumed it */
      resumed?: boolean;
      manifestUploaded?: boolean;
      /** indexes of the chunks the service already holds (resumed plans only) */
      uploadedChunks?: number[];
      chunkCount?: number;
      /** present when the resumed plan was already verified */
      verifiedAt?: string | null;
      receiptDigest?: string | null;
    }>(
      "backup",
      "/v1/backups",
      { method: "POST", body: input, token: "backup" },
    );
  }

  listBackups(workspaceId: string, limit = 50) {
    return this.requestJson<{ backups: Array<{
      backup_id: string;
      shop_id: string;
      retention_class: string;
      manifest_sha256: string;
      manifest_bytes: number;
      chunk_count: number;
      total_bytes: number;
      state: string;
      created_at: string;
      verified_at: string | null;
      /** how far an unfinished backup got (older services do not report them) */
      manifest_uploaded_at?: string | null;
      chunks_uploaded?: number;
    }> }>("backup", "/v1/backups", {
      query: { workspaceId, limit },
      token: "backup",
    });
  }

  uploadBackupManifest(backupId: string, workspaceId: string, bytes: Uint8Array) {
    return this.backupBinaryRequest<{ backupId: string; status: "uploaded"; replay: boolean }>(
      `/v1/backups/${encodeURIComponent(backupId)}/manifest`,
      { method: "PUT", workspaceId, body: bytes },
    );
  }

  uploadBackupChunk(
    backupId: string,
    chunkIndex: number,
    workspaceId: string,
    bytes: Uint8Array,
  ) {
    return this.backupBinaryRequest<{
      backupId: string;
      chunkIndex: number;
      status: "uploaded";
      replay: boolean;
    }>(`/v1/backups/${encodeURIComponent(backupId)}/chunks/${chunkIndex}`, {
      method: "PUT",
      workspaceId,
      body: bytes,
    });
  }

  verifyBackup(backupId: string, input: {
    workspaceId: string;
    verifiedAt: string;
    signature: string;
  }) {
    return this.requestJson<{
      backupId: string;
      state: "verified";
      verifiedAt: string;
      receiptDigest?: string;
    }>("backup", `/v1/backups/${encodeURIComponent(backupId)}/verify`, {
      method: "POST",
      token: "backup",
      body: input,
    });
  }

  getBackupRestorePlan(backupId: string, workspaceId: string) {
    return this.requestJson<{
      backupId: string;
      shopId: string;
      wrappedDek: string;
      manifestSha256: string;
      manifestBytes: number;
      totalBytes: number;
      chunks: Array<{ chunk_index: number; sha256: string; byte_size: number }>;
    }>("backup", `/v1/backups/${encodeURIComponent(backupId)}/restore-plan`, {
      query: { workspaceId },
      token: "backup",
    });
  }

  downloadBackupManifest(
    backupId: string,
    workspaceId: string,
    expectedBytes: number,
    expectedSha256: string,
  ) {
    return this.downloadBackupObject(
      `/v1/backups/${encodeURIComponent(backupId)}/manifest`,
      workspaceId,
      expectedBytes,
      expectedSha256,
    );
  }

  downloadBackupChunk(
    backupId: string,
    chunkIndex: number,
    workspaceId: string,
    expectedBytes: number,
    expectedSha256: string,
  ) {
    return this.downloadBackupObject(
      `/v1/backups/${encodeURIComponent(backupId)}/chunks/${chunkIndex}`,
      workspaceId,
      expectedBytes,
      expectedSha256,
    );
  }

  deleteRemoteBackup(backupId: string, workspaceId: string) {
    return this.requestJson<{ backupId: string; state: "deleted" }>(
      "backup",
      `/v1/backups/${encodeURIComponent(backupId)}`,
      { method: "DELETE", query: { workspaceId }, token: "backup" },
    );
  }
}
