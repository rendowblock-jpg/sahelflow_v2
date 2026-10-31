// W3-F3 step 3: any projection kind through the real client with REAL crypto. The plaintext of orders and chats is never written.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createConnectedEnvelope } from "../../../src/lib/connected-platform/envelope";
import { generateConnectedKeyPair, type ConnectedKeyPair } from "../../../src/lib/connected-platform/payload-crypto";
import { CONNECTED_CIPHER_ALGORITHM, CONNECTED_PROTOCOL_VERSION, CONNECTED_SIGNATURE_ALGORITHM } from "../../../src/lib/connected-platform/protocol";
import { generateDeviceKeys, type DeviceKeys, type DevicePublicKeys } from "../../../src/lib/connected-platform/web";
import { INSTALLATION_ID, SHOP_ID, WORKSPACE_ID } from "../../connected/__tests__/harness";
import { loadDeviceKeys, saveDeviceKeys, type Db, type StoreName } from "../src/storage/idb";
import { getSealed, openSealed } from "../src/storage/sealed";
import { createRelayClient, parseDashboard } from "../src/today/relay-source";

const DEVICE = "phone_pwa_0001"; const T = Date.now() - 60_000;
let desktop: ConnectedKeyPair; let phone: { keys: DeviceKeys; publicKeys: DevicePublicKeys };
beforeAll(async () => {
  desktop = generateConnectedKeyPair(); const made = await generateDeviceKeys(); if (!made.ok) throw new Error("setup: phone keys");
  phone = { keys: made.keys, publicKeys: made.publicKeys };
}, 120_000);

function memoryDb() {
  const stores = new Map<string, Map<string, unknown>>();
  const of = (n: string): Map<string, unknown> => { let m = stores.get(n); if (!m) { m = new Map(); stores.set(n, m); } return m; };
  const db: Db = {
    get: async <V>(n: StoreName, k: string) => of(n).get(k) as V | undefined, put: async (n, k, v) => { of(n).set(k, v); },
    remove: async (n, k) => { of(n).delete(k); }, clear: async (n) => { of(n).clear(); }, keys: async (n) => [...of(n).keys()], close: () => undefined,
  };
  return { db, dump: () => JSON.stringify([...stores].map(([n, m]) => [n, [...m]])) };
}
function envelope(kind: "orders" | "conversations", sequence: number, payload: unknown) {
  const envelopeId = `projection_${randomUUID().replaceAll("-", "")}`;
  return createConnectedEnvelope({
    protocolVersion: CONNECTED_PROTOCOL_VERSION, envelopeId, idempotencyKey: envelopeId, workspaceId: WORKSPACE_ID, shopId: SHOP_ID, memberId: "member_owner", deviceId: DEVICE,
    installationId: INSTALLATION_ID, senderKind: "desktop", senderId: INSTALLATION_ID, recipientKind: "device", recipientId: DEVICE, messageType: `projection.${kind}`, sequence,
    issuedAt: new Date(T).toISOString(), expiresAt: new Date(T + 15 * 60_000).toISOString(), revocationEpoch: 0, cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM,
    encryptionKeyId: "enckey_00000001", signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM, signingKeyId: "sigkey_00000001",
  }, payload, phone.publicKeys.encryptionPublicKey, desktop.signingPrivateKeyPkcs8);
}
function serve(envs: Map<string, { sequence: number }>, urls: string[], ignoreSince = false): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); urls.push(url.search);
    const env = envs.get(url.searchParams.get("type") ?? "");
    if (!env) return new Response("{}", { status: 404 });
    if (!ignoreSince && Number(url.searchParams.get("sinceSequence") ?? 0) >= env.sequence) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(env), { status: 200 });
  }) as typeof fetch;
}
async function paired() {
  const mem = memoryDb(); await saveDeviceKeys(mem.db, phone.keys);
  await mem.db.put("keys", "credentials", { deviceId: DEVICE, workspaceId: WORKSPACE_ID, memberId: "member_owner", deviceToken: "t".repeat(40), shopId: null });
  await mem.db.put("keys", "desktop", { signingPublicKey: desktop.signingPublicKey });
  return mem;
}
const ORDERS = { rows: [{ id: "o1", orderNumber: 1042, customer: { name: "Karim Benali", phone: "0550123456" } }] };

describe("any projection kind", () => {
  it("orders: stored as received, plaintext never written, opened in memory only and only within 24 h", async () => {
    const mem = await paired(); const env = envelope("orders", 1, ORDERS); const urls: string[] = [];
    const relay = createRelayClient({ baseUrl: "https://relay.test", getDb: async () => mem.db, fetchImpl: serve(new Map([["orders", env]]), urls), now: () => T + 1000 });
    expect(await relay.poll("orders")).toEqual({ kind: "stored", sequence: 1 });
    const dump = mem.dump(); expect(dump).not.toContain("Karim"); expect(dump).not.toContain("0550123456");
    const row = await getSealed(mem.db, "orders"); const keys = await loadDeviceKeys(mem.db);
    if (!row || !keys) throw new Error("setup: nothing stored");
    expect(row.envelope).toEqual(JSON.parse(JSON.stringify(env)));
    const ctx = (now: number) => ({ signingPublicKey: desktop.signingPublicKey, encryptionPrivateKey: keys.encryption.privateKey, deviceId: DEVICE, now });
    expect(await openSealed(row, ctx(T + 20 * 3_600_000))).toMatchObject({ rows: [{ customer: { name: "Karim Benali" } }] });
    expect(await openSealed(row, ctx(row.receivedAt + 25 * 3_600_000))).toBeNull();
  });
  it("asks with sinceSequence for its own kind; the same sequence is unchanged; an older one and a wrong message type are refused", async () => {
    const mem = await paired(); const urls: string[] = [];
    const relay = createRelayClient({ baseUrl: "https://relay.test", getDb: async () => mem.db, fetchImpl: serve(new Map([["conversations", envelope("conversations", 2, {})]]), urls), now: () => T + 1000 });
    expect(await relay.poll("conversations")).toEqual({ kind: "stored", sequence: 2 });
    expect(await relay.poll("conversations")).toEqual({ kind: "unchanged" });
    expect(urls[1]).toContain("sinceSequence=2"); expect(urls[1]).toContain("type=conversations");
    const replay = createRelayClient({ baseUrl: "https://relay.test", getDb: async () => mem.db, fetchImpl: serve(new Map([["conversations", envelope("conversations", 1, {})]]), [], true), now: () => T + 1000 });
    expect(await replay.poll("conversations")).toMatchObject({ kind: "refused" });
    const wrong = createRelayClient({ baseUrl: "https://relay.test", getDb: async () => mem.db, fetchImpl: serve(new Map([["orders", envelope("conversations", 1, {})]]), []), now: () => T + 1000 });
    expect(await wrong.poll("orders")).toEqual({ kind: "refused", reason: "wrong_scope" });
  });
  it("the dashboard exposes the command authority (policy version and when it ends)", () => {
    const p = parseDashboard({ stats: { ordersToday: 1 }, connectedCommandAuthority: { policyVersion: 7, expiresAt: "2026-10-31T08:15:00.000Z" } }, T);
    expect(p?.authority).toEqual({ policyVersion: 7, expiresAt: Date.parse("2026-10-31T08:15:00.000Z") });
    expect(parseDashboard({ stats: { ordersToday: 1 } }, T)).not.toHaveProperty("authority");
  });
});
