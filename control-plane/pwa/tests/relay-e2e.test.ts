// S3b: the PWA's own pairing flow, transport and projection source against the REAL relay worker on
// node:sqlite (the pairing-handshake harness), with the desktop side built by the real pairing-trust
// helpers. The relay is also the attacker: it rewrites its own exchange reply.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../../connected/worker";
import { INSTALLATION_ID, RELAY, SHOP_ID, WORKSPACE_ID, createWorld, type World } from "../../connected/__tests__/harness";
import { ConnectedPlatformClient } from "../../../src/lib/connected-platform/client";
import { createConnectedEnvelope } from "../../../src/lib/connected-platform/envelope";
import { buildDesktopPairingLink } from "../../../src/lib/connected-platform/pairing-link";
import { encodeDesktopKeyProof, importDesktopSigningPrivateKey, signDesktopEncryptionKey } from "../../../src/lib/connected-platform/pairing-trust";
import { generateConnectedKeyPair, type ConnectedKeyPair } from "../../../src/lib/connected-platform/payload-crypto";
import { CONNECTED_CIPHER_ALGORITHM, CONNECTED_PROTOCOL_VERSION, CONNECTED_SIGNATURE_ALGORITHM } from "../../../src/lib/connected-platform/protocol";
import { generateDeviceKeys, type DeviceKeys, type DevicePublicKeys } from "../../../src/lib/connected-platform/web";
import { runPairing, takePairingLink, type KeygenRunner, type PairStore, type TrustRefusal } from "../src/pair/flow";
import { createFetchTransport } from "../src/pair/transport";
import { STORES, saveDeviceKeys, type Db, type StoreName } from "../src/storage/idb";
import { createRelayClient } from "../src/today/relay-source";

let desktop: ConnectedKeyPair; let impostor: ConnectedKeyPair; let phone: { keys: DeviceKeys; publicKeys: DevicePublicKeys };
let goodProof = ""; let impostorProof = ""; let oldRsaProof = ""; let oldRsa = "";

async function proofFor(rsaJwk: string, pkcs8: string): Promise<string> {
  const key = await importDesktopSigningPrivateKey(pkcs8); if (!key) throw new Error("setup: key");
  const signed = await signDesktopEncryptionKey(rsaJwk, key); if (!signed.ok) throw new Error("setup: sign");
  const proof = encodeDesktopKeyProof(signed.signature, signed.context); if (!proof) throw new Error("setup: proof");
  return proof;
}
beforeAll(async () => {
  desktop = generateConnectedKeyPair(); impostor = generateConnectedKeyPair(); const older = generateConnectedKeyPair();
  goodProof = await proofFor(desktop.encryptionPublicKeyJwk, desktop.signingPrivateKeyPkcs8);
  impostorProof = await proofFor(impostor.encryptionPublicKeyJwk, impostor.signingPrivateKeyPkcs8);
  oldRsa = older.encryptionPublicKeyJwk; oldRsaProof = await proofFor(oldRsa, desktop.signingPrivateKeyPkcs8);
  const made = await generateDeviceKeys(); if (!made.ok) throw new Error("setup: phone keys");
  phone = { keys: made.keys, publicKeys: made.publicKeys };
}, 120_000);

// A Map-backed Db with the same surface as the IndexedDB wrapper; counts writes.
function memoryDb() {
  const stores = new Map<string, Map<string, unknown>>(); let puts = 0;
  const of = (n: string): Map<string, unknown> => { let m = stores.get(n); if (!m) { m = new Map(); stores.set(n, m); } return m; };
  const db: Db = {
    get: async <T>(n: StoreName, k: string) => of(n).get(k) as T | undefined,
    put: async (n, k, v) => { puts += 1; of(n).set(k, v); },
    remove: async (n, k) => { of(n).delete(k); }, clear: async (n) => { of(n).clear(); }, keys: async (n) => [...of(n).keys()], close: () => undefined,
  };
  return { db, puts: () => puts, size: () => [...stores.values()].reduce((a, m) => a + m.size, 0) };
}

type Attack = (reply: Record<string, unknown>) => Record<string, unknown>;
async function newWorld() {
  const world: World = await createWorld({ desktop: { signingPublicKeyBase64: desktop.signingPublicKey, encryptionPublicKeyJwk: desktop.encryptionPublicKeyJwk } });
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), world.env));
  const client = new ConnectedPlatformClient({ endpoints: { control: RELAY, storefront: RELAY, backup: RELAY }, controlToken: async () => world.desktopToken, backupToken: async () => "b".repeat(40), timeoutMs: 5_000 });
  return { world, client };
}
async function desktopPairing(client: ConnectedPlatformClient, deviceId: string, proof: string | null) {
  const pairing = await client.createPairing({ workspaceId: WORKSPACE_ID, memberId: "member_owner", deviceId, ...(proof === null ? {} : { desktopKeyProof: proof }) });
  const built = await buildDesktopPairingLink({ pairingId: pairing.pairingId, pairingToken: pairing.pairingToken, desktopSigningPublicKey: desktop.signingPublicKey });
  if (!built) throw new Error("setup: link");
  const taken = takePairingLink(built.hash, "/", () => undefined); if (taken.kind !== "link") throw new Error("setup: take");
  return taken.link;
}
// The reply goes through the real worker; an attack rewrites it on the way back. Nothing is added by hand:
// the real exchange reply has no shopId, the phone finds its shop from the verified projection.
function phoneFetch(world: World, attack?: Attack): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await worker.fetch(new Request(input, init), world.env);
    if (!String(input).endsWith("/v1/pairings/exchange") || res.status !== 201) return res;
    const json = (await res.json()) as Record<string, unknown>;
    const out = attack ? attack({ ...json }) : json;
    return new Response(JSON.stringify(out), { status: 201, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
function pairPhone(world: World, link: Awaited<ReturnType<typeof desktopPairing>>, mem: ReturnType<typeof memoryDb>, attack?: Attack) {
  const keygen: KeygenRunner = { async run(onStep) { onStep("signing"); onStep("encryption"); return { ok: true, keys: phone.keys, publicKeys: phone.publicKeys }; } };
  const store: PairStore = {
    saveKeys: (k) => saveDeviceKeys(mem.db, k), saveTrust: (t) => mem.db.put("keys", "desktop", t), saveCredentials: (c) => mem.db.put("keys", "credentials", c),
    discard: async () => { for (const s of STORES) await mem.db.clear(s); },
  };
  return runPairing({ link, online: true, keygen, store, onStep: () => undefined, transport: createFetchTransport({ baseUrl: RELAY, fetchImpl: phoneFetch(world, attack) }) });
}

describe("the PWA pairing flow against the real relay", () => {
  it("happy path: trusted, and the phone stores the keys, the pinned desktop and the credentials", async () => {
    const { world, client } = await newWorld(); const mem = memoryDb();
    const out = await pairPhone(world, await desktopPairing(client, "phone_pwa_0001", goodProof), mem);
    expect(out).toMatchObject({ ok: true, approval: "pending" });
    expect(await mem.db.keys("keys")).toEqual(["device", "desktop", "credentials"]);
    expect(await mem.db.get("keys", "desktop")).toMatchObject({ signingPublicKey: desktop.signingPublicKey });
    expect(await mem.db.get("keys", "credentials")).toMatchObject({ deviceId: "phone_pwa_0001", workspaceId: WORKSPACE_ID, shopId: null });
  });
  const attacks: ReadonlyArray<readonly [string, boolean, Attack | undefined, TrustRefusal]> = [
    ["an old desktop that sent no proof", false, undefined, "proof_missing"],
    ["the relay strips the proof", true, (r) => ({ ...r, desktopKeyProof: null }), "proof_missing"],
    ["the relay swaps the RSA key (keeps the proof)", true, (r) => ({ ...r, desktopEncryptionPublicKey: impostor.encryptionPublicKeyJwk }), "bad_signature"],
    ["the relay swaps the signing key", true, (r) => ({ ...r, desktopSigningPublicKey: impostor.signingPublicKey }), "key_mismatch_with_pin"],
    ["the relay swaps the keys AND the proof for its own consistent set", true, (r) => ({ ...r, desktopSigningPublicKey: impostor.signingPublicKey, desktopEncryptionPublicKey: impostor.encryptionPublicKeyJwk, desktopKeyProof: impostorProof }), "key_mismatch_with_pin"],
    ["the relay replays an old proof for an older RSA key", true, (r) => ({ ...r, desktopEncryptionPublicKey: oldRsa, desktopKeyProof: goodProof }), "bad_signature"],
    ["the relay replays a proof signed for another RSA key under the real signing key", true, (r) => ({ ...r, desktopKeyProof: oldRsaProof }), "bad_signature"],
  ];
  it.each(attacks)("%s: refused with %s... the phone stores nothing", async (_name, withProof, attack, reason) => {
    const { world, client } = await newWorld(); const mem = memoryDb();
    const link = await desktopPairing(client, "phone_pwa_0002", withProof ? goodProof : null);
    const out = await pairPhone(world, link, mem, attack);
    expect(out).toMatchObject({ ok: false, reason });
    expect(mem.puts()).toBe(0); expect(mem.size()).toBe(0);
  });
});

async function publish(client: ConnectedPlatformClient, deviceId: string, sequence: number, payload: unknown, shopId: string = SHOP_ID): Promise<unknown> {
  const listed = await client.listDevices(WORKSPACE_ID);
  const row = (listed.devices as Array<{ device_id: string; member_id: string; encryption_public_key: string }>).find((d) => d.device_id === deviceId);
  if (!row) throw new Error("device not listed");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await client.putCommandPolicy({ workspaceId: WORKSPACE_ID, shopId, memberId: row.member_id, deviceId, policyVersion: 1, memberRevocationEpoch: 0, deviceRevocationEpoch: 0, allowedCommands: ["command.comments.write"], expiresAt }).catch(() => undefined);
  const envelopeId = `projection_${randomUUID().replaceAll("-", "")}`;
  const envelope = createConnectedEnvelope({
    protocolVersion: CONNECTED_PROTOCOL_VERSION, envelopeId, idempotencyKey: envelopeId, workspaceId: WORKSPACE_ID, shopId, memberId: row.member_id, deviceId,
    installationId: INSTALLATION_ID, senderKind: "desktop", senderId: INSTALLATION_ID, recipientKind: "device", recipientId: deviceId, messageType: "projection.dashboard", sequence,
    issuedAt: new Date(Date.now() - 1_000).toISOString(), expiresAt, revocationEpoch: 0, cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM, encryptionKeyId: "enckey_00000001",
    signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM, signingKeyId: "sigkey_00000001",
  }, payload, row.encryption_public_key, desktop.signingPrivateKeyPkcs8);
  await client.putProjection(envelope);
  return envelope;
}
const dashboard = (ordersToday: number, extra: Record<string, unknown> = {}) => ({
  stats: { ordersToday, pendingDeliveries: 2, activeConversations: 1, ...extra },
  recentOrders: [{ status: "pending" }, { status: "pending" }, { status: "delivered" }],
  analytics: { revenueSeries: [{ date: "2026-10-29", revenue: 1000, orders: 3 }, { date: "2026-10-30", revenue: 2000, orders: 5 }] },
});

describe("the real projection source (sealed envelopes opened with the pinned key)", () => {
  it("pending until approved, then real numbers; unchanged on 304; a backwards sequence is refused and the last good snapshot stays", async () => {
    const { world, client } = await newWorld(); const mem = memoryDb();
    const link = await desktopPairing(client, "phone_pwa_0003", goodProof);
    expect((await pairPhone(world, link, mem)).ok).toBe(true);
    const relay = createRelayClient({ baseUrl: RELAY, fetchImpl: phoneFetch(world), getDb: async () => mem.db });
    expect(await relay.source.load()).toEqual({ ok: false, reason: "none" });
    expect(await relay.poll()).toEqual({ kind: "pending" });

    const first = await publish(client, "phone_pwa_0003", 1, dashboard(7, { whatsappHeld: 3 }));
    const got = await relay.poll();
    expect(got).toMatchObject({ kind: "updated", snapshot: { sequence: 1, projection: { newOrders: 7, toConfirm: 2, inDelivery: 2, whatsappHeld: 3 } } });
    expect(await relay.poll()).toEqual({ kind: "unchanged" });
    const loaded = await relay.source.load();
    expect(loaded).toMatchObject({ ok: true, projection: { newOrders: 7 } });

    await publish(client, "phone_pwa_0003", 2, dashboard(9));
    expect(await relay.poll()).toMatchObject({ kind: "updated", snapshot: { sequence: 2, projection: { newOrders: 9 } } });

    // the relay replays the first (older) envelope: refused, and the phone keeps sequence 2
    const replay = createRelayClient({ baseUrl: RELAY, getDb: async () => mem.db, fetchImpl: (async () => new Response(JSON.stringify(first), { status: 200 })) as unknown as typeof fetch });
    expect(await replay.poll()).toEqual({ kind: "refused", reason: "stale_sequence" });
    expect(await relay.source.load()).toMatchObject({ ok: true, projection: { newOrders: 9 } });
  });
  it("an envelope sealed to another phone is refused and a removed phone is reported as revoked", async () => {
    const { world, client } = await newWorld(); const mem = memoryDb();
    expect((await pairPhone(world, await desktopPairing(client, "phone_pwa_0004", goodProof), mem)).ok).toBe(true);
    const env = await publish(client, "phone_pwa_0004", 1, dashboard(1));
    const other = createRelayClient({ baseUrl: RELAY, getDb: async () => mem.db, fetchImpl: (async () => new Response(JSON.stringify({ ...(env as object), recipientId: "someone_else" }), { status: 200 })) as unknown as typeof fetch });
    expect(await other.poll()).toMatchObject({ kind: "refused" });
    expect(await mem.db.get("projections", "last")).toBeUndefined();
    const gone = createRelayClient({ baseUrl: RELAY, getDb: async () => mem.db, fetchImpl: (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch });
    expect(await gone.poll()).toEqual({ kind: "revoked" });
  });
});

// Shop discovery: the exchange reply has no shop. The phone asks WITHOUT shopId and learns the shop from the
// VERIFIED envelope; two live shops -> 409 shop_required and one retry with the first listed id.
const OTHER_SHOP = "shop_0002";
const spied = (world: World, calls: string[]): typeof fetch => (async (input: RequestInfo | URL, init?: RequestInit) => { calls.push(String(input)); return worker.fetch(new Request(input, init), world.env); }) as typeof fetch;
const queryOf = (url: string): URLSearchParams => new URL(url).searchParams;
async function pairedPhone(deviceId: string) {
  const { world, client } = await newWorld(); const mem = memoryDb();
  expect((await pairPhone(world, await desktopPairing(client, deviceId, goodProof), mem)).ok).toBe(true);
  const calls: string[] = [];
  const relay = createRelayClient({ baseUrl: RELAY, fetchImpl: spied(world, calls), getDb: async () => mem.db });
  const projectionCalls = (): string[] => calls.filter((u) => u.includes("/v1/projections"));
  return { world, client, mem, relay, calls, projectionCalls };
}

describe("shop discovery against the real relay (no hand-added shopId)", () => {
  it("none: pending, no shopId sent, nothing stored", async () => {
    const p = await pairedPhone("phone_pwa_0010");
    expect(await p.relay.poll()).toEqual({ kind: "pending" });
    expect(queryOf(p.projectionCalls()[0] ?? "http://x/?").has("shopId")).toBe(false);
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: null });
  });
  it("one shop: the shop comes from the verified envelope, is stored, and later polls send it", async () => {
    const p = await pairedPhone("phone_pwa_0011");
    await publish(p.client, "phone_pwa_0011", 1, dashboard(4));
    expect(await p.relay.poll()).toMatchObject({ kind: "updated", snapshot: { sequence: 1, projection: { newOrders: 4 } } });
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: SHOP_ID });
    expect(await p.relay.poll()).toEqual({ kind: "unchanged" });
    const sent = p.projectionCalls().map((u) => queryOf(u).get("shopId"));
    expect(sent).toEqual([null, SHOP_ID]);
  });
  it("two shops: 409 shop_required, then ONE retry with the first listed id, which is stored", async () => {
    const p = await pairedPhone("phone_pwa_0012");
    await publish(p.client, "phone_pwa_0012", 1, dashboard(5), SHOP_ID);
    await publish(p.client, "phone_pwa_0012", 1, dashboard(6), OTHER_SHOP);
    const first = [SHOP_ID, OTHER_SHOP].sort()[0] ?? "";
    const got = await p.relay.poll();
    expect(got).toMatchObject({ kind: "updated", snapshot: { sequence: 1 } });
    expect(p.projectionCalls().map((u) => queryOf(u).get("shopId"))).toEqual([null, first]);
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: first });
  });
  it("a stored shop that answers 404 three polls in a row is forgotten and the phone rediscovers (another shop, lower sequence)", async () => {
    const p = await pairedPhone("phone_pwa_0013");
    await publish(p.client, "phone_pwa_0013", 9, dashboard(8));
    expect(await p.relay.poll()).toMatchObject({ kind: "updated", snapshot: { sequence: 9 } });
    p.world.d1.sqlite.exec("UPDATE connected_projection SET expires_at = '2020-01-01T00:00:00.000Z'");
    expect(await p.relay.poll()).toEqual({ kind: "pending" });
    expect(await p.relay.poll()).toEqual({ kind: "pending" });
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: SHOP_ID });
    expect(await p.relay.poll()).toEqual({ kind: "pending" });
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: null });
    await publish(p.client, "phone_pwa_0013", 1, dashboard(2), OTHER_SHOP);
    expect(await p.relay.poll()).toMatchObject({ kind: "updated", snapshot: { sequence: 1, projection: { newOrders: 2 } } });
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: OTHER_SHOP });
  });
  it("two 404s then a good answer do not forget the shop (the count is consecutive)", async () => {
    const p = await pairedPhone("phone_pwa_0014");
    await publish(p.client, "phone_pwa_0014", 1, dashboard(1));
    expect((await p.relay.poll()).kind).toBe("updated");
    p.world.d1.sqlite.exec("UPDATE connected_projection SET expires_at = '2020-01-01T00:00:00.000Z'");
    await p.relay.poll(); await p.relay.poll();
    await publish(p.client, "phone_pwa_0014", 2, dashboard(3));
    expect((await p.relay.poll()).kind).toBe("updated");
    p.world.d1.sqlite.exec("UPDATE connected_projection SET expires_at = '2020-01-01T00:00:00.000Z'");
    await p.relay.poll(); await p.relay.poll();
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: SHOP_ID });
  });
  it("never accepts an envelope from a shop other than the stored one, nor one from a shop the relay did not list", async () => {
    const p = await pairedPhone("phone_pwa_0015");
    const other = await publish(p.client, "phone_pwa_0015", 1, dashboard(6), OTHER_SHOP);
    // discovery: the relay lists SHOP_ID but serves the OTHER_SHOP envelope
    const lying = (listed: string) => (async (input: RequestInfo | URL) => String(input).includes("shopId=") ? new Response(JSON.stringify(other), { status: 200 }) : new Response(JSON.stringify({ error: "shop_required", shops: [listed] }), { status: 409 })) as unknown as typeof fetch;
    const liar = createRelayClient({ baseUrl: RELAY, getDb: async () => p.mem.db, fetchImpl: lying(SHOP_ID) });
    expect(await liar.poll()).toEqual({ kind: "refused", reason: "wrong_scope" });
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: null });
    expect(await p.mem.db.get("projections", "last")).toBeUndefined();
    // stored shop A, the relay serves shop B
    expect((await p.relay.poll()).kind).toBe("updated");
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: OTHER_SHOP });
    const swapped = await publish(p.client, "phone_pwa_0015", 5, dashboard(9), SHOP_ID);
    const wrong = createRelayClient({ baseUrl: RELAY, getDb: async () => p.mem.db, fetchImpl: (async () => new Response(JSON.stringify(swapped), { status: 200 })) as unknown as typeof fetch });
    expect(await wrong.poll()).toEqual({ kind: "refused", reason: "wrong_scope" });
    expect(await p.mem.db.get("keys", "credentials")).toMatchObject({ shopId: OTHER_SHOP });
  });
  it("a 409 with an unusable list is refused, and a 409 while a shop is stored is just a network failure", async () => {
    const p = await pairedPhone("phone_pwa_0016");
    const answer = (body: unknown) => createRelayClient({ baseUrl: RELAY, getDb: async () => p.mem.db, fetchImpl: (async () => new Response(JSON.stringify(body), { status: 409 })) as unknown as typeof fetch });
    expect(await answer({ error: "shop_required", shops: [] }).poll()).toEqual({ kind: "refused", reason: "shop_required" });
    expect(await answer({ error: "shop_required" }).poll()).toEqual({ kind: "refused", reason: "shop_required" });
    const creds = await p.mem.db.get<Record<string, unknown>>("keys", "credentials");
    await p.mem.db.put("keys", "credentials", { ...creds, shopId: SHOP_ID });
    expect(await answer({ error: "shop_required", shops: [OTHER_SHOP] }).poll()).toEqual({ kind: "network" });
  });
});
