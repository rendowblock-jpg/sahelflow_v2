// W3-F3 round 2, step B: the phone's real transport. What the phone seals the desktop's own opener opens, what the desktop
// seals the phone opens; wrong recipient, altered payload, expired envelope and wrong signer are refused in both directions.
import { beforeAll, describe, expect, it } from "vitest";
import { createConnectedEnvelope, openConnectedEnvelope } from "../../../src/lib/connected-platform/envelope";
import { generateConnectedKeyPair, type ConnectedKeyPair } from "../../../src/lib/connected-platform/payload-crypto";
import { CONNECTED_CIPHER_ALGORITHM, CONNECTED_PROTOCOL_VERSION, CONNECTED_SIGNATURE_ALGORITHM, type ConnectedEnvelope } from "../../../src/lib/connected-platform/protocol";
import { generateDeviceKeys, type DeviceKeys, type DevicePublicKeys } from "../../../src/lib/connected-platform/web";
import { newCommandId } from "../src/outbox/ids";
import { createOutbox } from "../src/outbox/outbox";
import type { Db, StoreName } from "../src/storage/idb";
import { createPhoneTransport } from "../src/sync/transport";

const NOW = Date.UTC(2026, 9, 31, 8, 0, 0); const H = 3_600_000;
const ID = { deviceId: "phone_pwa_0001", deviceToken: "tok_secret_0001", workspaceId: "workspace_0001", memberId: "0123456789abcdef0123456789abcdef", shopId: "shop_00000001" };
const INSTALLATION = "installation_01"; const RELAY = "https://relay.example.test";
let desktop: ConnectedKeyPair; let other: ConnectedKeyPair; let phoneKeys: DeviceKeys; let phonePub: DevicePublicKeys;
beforeAll(async () => {
  desktop = generateConnectedKeyPair(); other = generateConnectedKeyPair();
  const made = await generateDeviceKeys(); if (!made.ok) throw new Error("setup: phone keys"); phoneKeys = made.keys; phonePub = made.publicKeys;
}, 120_000);

type Call = { url: string; init: RequestInit };
const pinnedOf = (k: ConnectedKeyPair) => ({ signingPublicKey: k.signingPublicKey, signingFingerprint: "fp", rsaPublicJwk: k.encryptionPublicKeyJwk });
function make(over: { fetch?: typeof fetch; now?: () => number; pinned?: ReturnType<typeof pinnedOf>; scope?: () => { installationId: string; revocationEpoch: number } | null } = {}) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = over.fetch ?? (async (url, init) => { calls.push({ url: String(url), init: init ?? {} }); return new Response(JSON.stringify({ state: "queued", relaySequence: 3 }), { status: 202 }); });
  const t = createPhoneTransport({ relayBase: RELAY, keys: phoneKeys, pinned: over.pinned ?? pinnedOf(desktop), identity: ID, scope: over.scope ?? (() => ({ installationId: INSTALLATION, revocationEpoch: 2 })), fetch: fetchImpl, now: over.now ?? (() => NOW) });
  return { t, calls };
}
const seal = (kind: "command.orders.confirm" | "command.orders.reject" | "command.messages.reply" | "command.comments.write", payload: unknown, expiresAt: number, extra: { commandId?: string } = {}) =>
  ({ commandId: extra.commandId ?? newCommandId(), idempotencyKey: newCommandId(), kind, payload, policyVersion: 7, expiresAt });
const open = (json: string, o: { signer?: string; key?: string; now?: number } = {}) =>
  openConnectedEnvelope<Record<string, unknown>>(JSON.parse(json), o.signer ?? phonePub.signingPublicKey, o.key ?? desktop.encryptionPrivateKeyPkcs8, new Date(o.now ?? NOW));
function desktopResult(commandId: string, payload: unknown, o: { recipientId?: string; deviceId?: string; signer?: ConnectedKeyPair; issuedAt?: number; ttl?: number } = {}): ConnectedEnvelope {
  const at = o.issuedAt ?? NOW;
  return createConnectedEnvelope({
    protocolVersion: CONNECTED_PROTOCOL_VERSION, envelopeId: commandId, idempotencyKey: newCommandId(), workspaceId: ID.workspaceId, shopId: ID.shopId, memberId: ID.memberId, deviceId: o.deviceId ?? ID.deviceId, installationId: INSTALLATION,
    senderKind: "desktop", senderId: INSTALLATION, recipientKind: "device", recipientId: o.recipientId ?? ID.deviceId, messageType: "command.result", sequence: 7,
    issuedAt: new Date(at).toISOString(), expiresAt: new Date(at + (o.ttl ?? 24 * H)).toISOString(), revocationEpoch: 2, cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM, encryptionKeyId: "device-rsa-oaep-v1", signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM, signingKeyId: "desktop-ed25519-v1",
  }, payload, phonePub.encryptionPublicKey, (o.signer ?? desktop).signingPrivateKeyPkcs8);
}

describe("seal: phone -> desktop, opened by the desktop's own opener", () => {
  it.each([
    ["command.orders.confirm", { orderId: "o1", expectedVersion: 3 }, 12 * H, 43_200_000],
    ["command.orders.reject", { orderId: "o1", expectedVersion: 3, reasonKey: "fakeOrder" }, 12 * H, 43_200_000],
    ["command.messages.reply", { conversationId: "conv_0000001", text: "ok" }, 4 * H, 14_400_000],
    ["command.comments.write", { entityType: "order", entityId: "o1", body: "n", mentionMemberIds: [], expectedVersion: 0 }, 24 * H, 86_400_000],
  ] as const)("%s opens with the right fields and expiry %s ms", async (kind, payload, expiry, literal) => {
    const { t } = make(); const input = seal(kind, payload, NOW + expiry);
    const opened = open(await t.seal(input));
    expect(opened.payload).toEqual(payload);
    const e = opened.envelope;
    expect(e).toMatchObject({ envelopeId: input.commandId, idempotencyKey: input.idempotencyKey, messageType: kind, sequence: 7, senderKind: "device", senderId: ID.deviceId, deviceId: ID.deviceId, recipientKind: "desktop", recipientId: INSTALLATION, installationId: INSTALLATION, workspaceId: ID.workspaceId, shopId: ID.shopId, memberId: ID.memberId, revocationEpoch: 2 });
    expect(Date.parse(e.expiresAt) - Date.parse(e.issuedAt)).toBe(literal);
  });
  it("is refused by the desktop opener: wrong recipient key, altered payload, expired, wrong signer", async () => {
    const { t } = make(); const json = await t.seal(seal("command.orders.confirm", { orderId: "o1", expectedVersion: 3 }, NOW + 12 * H));
    expect(() => open(json, { key: other.encryptionPrivateKeyPkcs8 })).toThrow();
    const env = JSON.parse(json) as Record<string, string>; const c = env.ciphertext as string; env.ciphertext = c.slice(0, 40) + (c[40] === "A" ? "B" : "A") + c.slice(41);
    expect(() => open(JSON.stringify(env))).toThrow();
    expect(() => open(json, { now: NOW + 12 * H + 1 })).toThrow(/expired/);
    expect(() => open(json, { signer: other.signingPublicKey })).toThrow();
    expect(open(json).payload).toEqual({ orderId: "o1", expectedVersion: 3 });
  });
  it("refuses to seal without a shop or without a scope", async () => {
    await expect(make({ scope: () => null }).t.seal(seal("command.orders.confirm", {}, NOW + H))).rejects.toThrow("no_scope");
    const { t } = createNoShop(); await expect(t.seal(seal("command.orders.confirm", {}, NOW + H))).rejects.toThrow("no_shop");
  });
  it("a re-seal after a policy change moves issuedAt but never makes the command live longer", async () => {
    const { t } = make({ now: () => NOW + 2 * H }); const e = open(await t.seal(seal("command.orders.confirm", { orderId: "o1", expectedVersion: 3 }, NOW + 12 * H)), { now: NOW + 2 * H }).envelope;
    expect(Date.parse(e.expiresAt)).toBe(NOW + 12 * H); expect(Date.parse(e.expiresAt) - Date.parse(e.issuedAt)).toBeLessThanOrEqual(12 * H);
  });
});
function createNoShop() {
  const t = createPhoneTransport({ relayBase: RELAY, keys: phoneKeys, pinned: pinnedOf(desktop), identity: { ...ID, shopId: null }, scope: () => ({ installationId: INSTALLATION, revocationEpoch: 2 }), fetch: async () => new Response("{}"), now: () => NOW });
  return { t };
}

describe("openResult: desktop -> phone, opened with the pinned PC signing key", () => {
  const cid = "11111111-2222-4333-8444-555555555555";
  it.each([
    [{ state: "committed", result: { messageId: "m1", effectKey: "e1", state: "queued", guarded: true } }, { outcome: "committed", guarded: true }],
    [{ state: "committed", result: { orderId: "o1" } }, { outcome: "committed" }],
    [{ state: "rejected", result: { code: "ALREADY_ANSWERED" } }, { outcome: "failed", code: "ALREADY_ANSWERED" }],
    [{ state: "conflict", result: { code: "ORDER_CHANGED" } }, { outcome: "failed", code: "ORDER_CHANGED" }],
    [{ state: "rejected", result: { code: "EXPIRED" } }, { outcome: "expired", code: "EXPIRED" }],
  ] as const)("%j -> %j", async (payload, want) => {
    const parsed = await make().t.openResult(desktopResult(cid, payload));
    expect(parsed).toMatchObject({ ok: true, deviceId: ID.deviceId, commandId: cid, ...want });
    if (!("guarded" in want)) expect((parsed as { guarded?: boolean }).guarded).toBeUndefined();
  });
  it("is refused: wrong signer, expired result, another recipient, another device, garbage", async () => {
    const good = { state: "committed", result: {} };
    expect(await make().t.openResult(desktopResult(cid, good, { signer: other }))).toEqual({ ok: false, reason: "bad_signature" });
    expect(await make({ now: () => NOW + 24 * H + 1 }).t.openResult(desktopResult(cid, good))).toEqual({ ok: false, reason: "expired" });
    expect(await make().t.openResult(desktopResult(cid, good, { recipientId: "someone_else_01" }))).toEqual({ ok: false, reason: "wrong_recipient" });
    expect(await make().t.openResult(desktopResult(cid, good, { deviceId: "phone_pwa_0002" }))).toEqual({ ok: false, reason: "wrong_device" });
    expect(await make().t.openResult({ nope: true })).toMatchObject({ ok: false });
    expect(await make().t.openResult(desktopResult(cid, { state: "teleported", result: {} }))).toMatchObject({ ok: false });
  });
});

describe("post and status talk to the relay's real routes", () => {
  it("post: POST /v1/commands with the device token and the stored text, unchanged", async () => {
    const { t, calls } = make(); const reply = await t.post("{\"sealed\":1}");
    expect(calls).toHaveLength(1); expect(calls[0]?.url).toBe(`${RELAY}/v1/commands`);
    expect(calls[0]?.init).toMatchObject({ method: "POST", body: "{\"sealed\":1}", credentials: "omit", cache: "no-store" });
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer tok_secret_0001");
    expect(reply).toMatchObject({ status: 202, body: { state: "queued", relaySequence: 3 } });
  });
  it("status: GET /v1/commands/{id}?workspaceId&deviceId; 429 carries Retry-After in ms", async () => {
    const { t, calls } = make(); await t.status("cmd_00000001");
    expect(calls[0]?.url).toBe(`${RELAY}/v1/commands/cmd_00000001?workspaceId=workspace_0001&deviceId=phone_pwa_0001`); expect(calls[0]?.init.method).toBe("GET");
    const limited = make({ fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "30" } }) });
    expect(await limited.t.post("{}")).toMatchObject({ status: 429, retryAfterMs: 30_000 });
  });
  it("a network failure rejects (the outbox keeps the command queued)", async () => {
    await expect(make({ fetch: async () => { throw new TypeError("offline"); } }).t.post("{}")).rejects.toThrow();
  });
});

function memDb(): Db {
  const m = new Map<string, Map<string, unknown>>(); const of = (s: StoreName): Map<string, unknown> => { let x = m.get(s); if (!x) { x = new Map(); m.set(s, x); } return x; };
  return { get: async <T>(s: StoreName, k: string) => of(s).get(k) as T | undefined, put: async (s, k, v) => { of(s).set(k, v); }, remove: async (s, k) => { of(s).delete(k); }, clear: async (s) => { of(s).clear(); }, keys: async (s) => [...of(s).keys()], close: () => undefined };
}
describe("the outbox on the real transport (a tiny relay + desktop in the fetch)", () => {
  async function world(statusReply: (posted: ConnectedEnvelope) => Response) {
    let posted: ConnectedEnvelope | null = null;
    const fetchImpl: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/v1/commands")) { posted = JSON.parse(String(init?.body)) as ConnectedEnvelope; return new Response(JSON.stringify({ commandId: posted.envelopeId, state: "queued", relaySequence: 1 }), { status: 202 }); }
      return posted ? statusReply(posted) : new Response("{}", { status: 404 });
    };
    const { t } = make({ fetch: fetchImpl });
    const ob = createOutbox({ db: memDb(), now: () => NOW, deviceId: ID.deviceId, newId: () => newCommandId(), policyVersion: () => 7, ...t });
    const out = await ob.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 }, labelForUi: "Order 1", draftText: "" });
    if (!out.ok) throw new Error("enqueue refused");
    await ob.flush(); return { ob };
  }
  it("committed only when the sealed result opens: the PC's committed result -> committed", async () => {
    const { ob } = await world((p) => new Response(JSON.stringify({ commandId: p.envelopeId, state: "committed", relaySequence: 1, result: desktopResult(p.envelopeId, { state: "committed", result: {} }) }), { status: 200 }));
    expect((await ob.list())[0]?.state).toBe("sent"); await ob.refresh(); expect((await ob.list())[0]?.state).toBe("committed");
  });
  it("a result signed by anyone but the pinned PC key never makes it committed", async () => {
    const { ob } = await world((p) => new Response(JSON.stringify({ commandId: p.envelopeId, state: "committed", relaySequence: 1, result: desktopResult(p.envelopeId, { state: "committed", result: {} }, { signer: other }) }), { status: 200 }));
    await ob.refresh(); expect((await ob.list())[0]?.state).toBe("sent");
  });
  it("status 404 is unknown, never failed", async () => {
    const { ob } = await world(() => new Response(JSON.stringify({ error: "command_not_found" }), { status: 404 }));
    await ob.refresh(); const r = (await ob.list())[0]; expect(r?.state).toBe("unknown"); expect(r?.lastError).toBe("relay_404");
  });
});
