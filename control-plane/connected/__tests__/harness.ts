// Test world for the relay worker: a real SQL database, a seeded workspace,
// real Ed25519 signatures. Everything goes through worker.fetch().
import { createHash } from "node:crypto";
import worker, { type ConnectedWorkerEnvironment } from "../worker";
import {
  canonicalConnectedEnvelopeBytes,
  type ConnectedEnvelope,
} from "../../../src/lib/connected-platform/protocol";
import { createTestD1, loadRelaySchema, type TestD1 } from "./d1-sqlite";

export const WORKSPACE_ID = "ws_00000001";
export const SHOP_ID = "shop_0001";
export const INSTALLATION_ID = "0123456789abcdef0123456789abcdef";
export const RELAY = "https://relay.test";
export const PWA_ORIGIN = "https://app.sahelflow.example";
const RSA_JWK = JSON.stringify({ kty: "RSA", n: "x".repeat(64), e: "AQAB" });

type SigningKey = { privateKey: CryptoKey; publicKeyBase64: string };

async function generateSigningKey(): Promise<SigningKey> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { privateKey: pair.privateKey, publicKeyBase64: Buffer.from(raw).toString("base64") };
}

export type Device = {
  deviceId: string;
  memberId: string;
  token: string;
  key: SigningKey;
};

export type CallInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  token?: string;
};

export type WorldOptions = {
  deviceLimit?: number;
  memberLimit?: number;
  yieldBetween?: boolean;
  pwaOrigins?: string | undefined;
};

let counter = 0;
const nextId = (prefix: string) => `${prefix}_${String(++counter).padStart(8, "0")}`;

export async function createWorld(options: WorldOptions = {}) {
  const d1: TestD1 = createTestD1({ yieldBetween: options.yieldBetween ?? false });
  loadRelaySchema(d1.sqlite);
  const desktopKey = await generateSigningKey();
  const desktopToken = "d".repeat(48);
  d1.sqlite.prepare(
    `INSERT INTO connected_workspace
     (workspace_id, license_id, installation_id, device_binding, product_major, license_type,
      entitlement_expires_at, shop_slots, member_limit, device_limit, features_json,
      entitlement_revocation_epoch, desktop_token_hash, desktop_signing_public_key,
      desktop_encryption_public_key)
     VALUES (?, 'license_00000001', ?, ?, 1, 'permanent', NULL, 1, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(
    WORKSPACE_ID,
    INSTALLATION_ID,
    `sfdb1_${"a".repeat(64)}`,
    options.memberLimit ?? 3,
    options.deviceLimit ?? 3,
    JSON.stringify(["sahelflow.connected"]),
    createHash("sha256").update(desktopToken).digest("hex"),
    desktopKey.publicKeyBase64,
    RSA_JWK,
  );

  const env: ConnectedWorkerEnvironment = {
    DB: d1.db,
    PRODUCT_MAJOR: "1",
    SF_LICENSE_TRIAL_PUBLIC_KEYS: "{}",
    SF_LICENSE_PERMANENT_PUBLIC_KEYS: "{}",
    ...(options.pwaOrigins === undefined ? {} : { PWA_ORIGINS: options.pwaOrigins }),
  };

  async function call(pathAndQuery: string, init: CallInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    return worker.fetch(
      new Request(`${RELAY}${pathAndQuery}`, {
        method: init.method ?? "GET",
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      }),
      env,
    );
  }

  async function createPairing(deviceId: string, memberId: string) {
    const response = await call("/v1/desktop/pairings", {
      method: "POST",
      token: desktopToken,
      body: { workspaceId: WORKSPACE_ID, memberId, deviceId },
    });
    return { response, body: (await response.json()) as Record<string, string> };
  }

  async function exchange(
    pairing: { pairingId: string; pairingToken: string },
    key: SigningKey,
    headers: Record<string, string> = { "CF-Connecting-IP": "203.0.113.7" },
  ) {
    return call("/v1/pairings/exchange", {
      method: "POST",
      headers,
      body: {
        pairingId: pairing.pairingId,
        pairingToken: pairing.pairingToken,
        signingPublicKey: key.publicKeyBase64,
        encryptionPublicKey: RSA_JWK,
      },
    });
  }

  /** Full pairing through the worker: desktop creates, phone exchanges. */
  async function pair(
    deviceId = nextId("device"),
    memberId = "member_owner",
    ip = "203.0.113.7",
  ): Promise<Device> {
    const created = await createPairing(deviceId, memberId);
    if (created.response.status !== 201) throw new Error(`createPairing ${created.response.status}`);
    const key = await generateSigningKey();
    const response = await exchange(
      { pairingId: created.body.pairingId ?? "", pairingToken: created.body.pairingToken ?? "" },
      key,
      { "CF-Connecting-IP": ip },
    );
    if (response.status !== 201) throw new Error(`exchange ${response.status}`);
    const issued = (await response.json()) as { deviceToken: string };
    return { deviceId, memberId, token: issued.deviceToken, key };
  }

  function allowCommands(
    device: Device,
    policy: { version?: number; memberEpoch?: number; deviceEpoch?: number; ttlMs?: number } = {},
  ) {
    d1.sqlite.prepare(
      `INSERT OR REPLACE INTO connected_command_policy
       (workspace_id, shop_id, member_id, device_id, policy_version, member_revocation_epoch,
        device_revocation_epoch, allowed_commands_json, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      WORKSPACE_ID,
      SHOP_ID,
      device.memberId,
      device.deviceId,
      policy.version ?? 1,
      policy.memberEpoch ?? 0,
      policy.deviceEpoch ?? 0,
      JSON.stringify(["command.comments.write"]),
      new Date(Date.now() + (policy.ttlMs ?? 15 * 60_000)).toISOString(),
    );
  }

  async function signEnvelope(
    key: SigningKey,
    fields: Partial<Omit<ConnectedEnvelope, "signature">> &
      Pick<ConnectedEnvelope, "senderKind" | "recipientKind" | "senderId" | "recipientId" | "messageType" | "deviceId" | "memberId">,
  ): Promise<ConnectedEnvelope> {
    const unsigned: Omit<ConnectedEnvelope, "signature"> = {
      protocolVersion: 1,
      envelopeId: nextId("env"),
      idempotencyKey: nextId("idem"),
      workspaceId: WORKSPACE_ID,
      shopId: SHOP_ID,
      installationId: INSTALLATION_ID,
      sequence: 1,
      issuedAt: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      revocationEpoch: 0,
      cipherAlgorithm: "rsa-oaep-256+aes-256-gcm-v1",
      encryptionKeyId: "enckey_00000001",
      aadDigest: "0".repeat(64),
      ciphertext: "QUJDREVGR0g=",
      signatureAlgorithm: "ed25519-v1",
      signingKeyId: "sigkey_00000001",
      ...fields,
    };
    const bytes = new Uint8Array(canonicalConnectedEnvelopeBytes(unsigned));
    const signature = new Uint8Array(
      await crypto.subtle.sign({ name: "Ed25519" }, key.privateKey, bytes.buffer as ArrayBuffer),
    );
    return { ...unsigned, signature: Buffer.from(signature).toString("base64") };
  }

  function commandEnvelope(device: Device, fields: Partial<Omit<ConnectedEnvelope, "signature">> = {}) {
    return signEnvelope(device.key, {
      senderKind: "device",
      recipientKind: "desktop",
      senderId: device.deviceId,
      recipientId: INSTALLATION_ID,
      messageType: "command.comments.write",
      deviceId: device.deviceId,
      memberId: device.memberId,
      ...fields,
    });
  }

  function projectionEnvelope(device: Device, fields: Partial<Omit<ConnectedEnvelope, "signature">> = {}) {
    return signEnvelope(desktopKey, {
      senderKind: "desktop",
      recipientKind: "device",
      senderId: INSTALLATION_ID,
      recipientId: device.deviceId,
      messageType: "projection.dashboard",
      deviceId: device.deviceId,
      memberId: device.memberId,
      ...fields,
    });
  }

  const submit = (device: Device, envelope: ConnectedEnvelope, headers?: Record<string, string>) =>
    call("/v1/commands", { method: "POST", token: device.token, body: envelope, ...(headers ? { headers } : {}) });
  const putProjection = (envelope: ConnectedEnvelope) =>
    call("/v1/desktop/projections", { method: "PUT", token: desktopToken, body: envelope });
  const getProjection = (device: Device, extra = "", headers?: Record<string, string>) =>
    call(
      `/v1/projections?workspaceId=${WORKSPACE_ID}&deviceId=${device.deviceId}&shopId=${SHOP_ID}&type=dashboard${extra}`,
      { token: device.token, ...(headers ? { headers } : {}) },
    );
  const revoke = (deviceId: string, revocationEpoch = 1) =>
    call(`/v1/desktop/devices/${deviceId}/revoke`, {
      method: "POST",
      token: desktopToken,
      body: { workspaceId: WORKSPACE_ID, revocationEpoch },
    });

  const rows = <T,>(sql: string, ...values: unknown[]) => d1.sqlite.prepare(sql).all(...values) as T[];
  const count = (sql: string, ...values: unknown[]) =>
    Number((d1.sqlite.prepare(sql).get(...values) as { n: number }).n);
  /** Writes to last_seen_at that really changed a row. */
  const lastSeenWrites = () =>
    d1.log.filter((entry) => entry.kind === "run" && entry.sql.includes("last_seen_at") && (entry.changes ?? 0) > 0).length;

  return {
    env, d1, desktopToken, call, createPairing, exchange, pair, allowCommands, commandEnvelope,
    projectionEnvelope, submit, putProjection, getProjection, revoke, rows, count, lastSeenWrites,
    generateSigningKey,
  };
}

export type World = Awaited<ReturnType<typeof createWorld>>;
