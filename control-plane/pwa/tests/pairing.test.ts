import { describe, expect, it } from "vitest";
import { base64UrlEncode, buildPairingExchangeBody } from "../../../src/lib/connected-platform/web";
import { runPairing, takePairingLink, type ExchangeResult, type KeygenRunner, type PairStep, type PairStore, type PairingTransport } from "../src/pair/flow";
import { createFetchTransport } from "../src/pair/transport";

// A well-formed RSA public key; the pairing code needs one.
const RSA_JWK = JSON.stringify({ kty: "RSA", n: "A".repeat(512), e: "AQAB" });
const ID = "0123456789abcdef0123456789abcdef";
const TOKEN = base64UrlEncode(new Uint8Array(32).fill(7));
const HASH = `#p=${ID}.${TOKEN}.A1B2C3D4E5F67788`;
const PIN = "A1B2-C3D4-E5F6-7788";

async function realishKeygen(order: string[]): Promise<KeygenRunner> {
  const signing = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", signing.publicKey));
  const b64 = btoa(String.fromCharCode(...raw));
  return {
    async run(onStep) {
      order.push("keygen"); onStep("signing"); onStep("encryption");
      return { ok: true, keys: { signing, encryption: signing }, publicKeys: { signingPublicKey: b64, encryptionPublicKey: RSA_JWK } };
    },
  };
}
function harness(over: { exchange?: () => Promise<ExchangeResult> } = {}) {
  const order: string[] = []; const steps: PairStep[] = []; const creds: unknown[] = [];
  const transport: PairingTransport = {
    async exchange() { order.push("exchange"); if (over.exchange) return over.exchange(); throw new Error("no exchange wanted"); },
  };
  const store: PairStore = {
    async saveKeys() { order.push("saveKeys"); }, async saveTrust() { order.push("saveTrust"); },
    async saveCredentials(c) { order.push("saveCredentials"); creds.push(c); }, async discard() { order.push("discard"); },
  };
  return { order, steps, creds, transport, store, onStep: (s: PairStep) => steps.push(s) };
}

describe("takePairingLink", () => {
  it("reads a valid fragment (with its pin) and removes it from the address bar before anything else", () => {
    const urls: string[] = [];
    expect(takePairingLink(HASH, "/?screen=pair", (u) => urls.push(u))).toEqual({ kind: "link", link: { pairingId: ID, pairingToken: TOKEN, pin: PIN } });
    expect(urls).toEqual(["/?screen=pair"]);
  });
  it("removes an unreadable fragment too (it may still hold a token)", () => {
    const urls: string[] = [];
    expect(takePairingLink("#p=zzz", "/", (u) => urls.push(u))).toEqual({ kind: "invalid" });
    expect(urls).toEqual(["/"]);
  });
  it("does nothing when there is no fragment, and ignores other fragments", () => {
    const urls: string[] = [];
    expect(takePairingLink("", "/", (u) => urls.push(u))).toEqual({ kind: "none" });
    expect(takePairingLink("#top", "/", (u) => urls.push(u))).toEqual({ kind: "none" });
    expect(urls).toEqual([]);
  });
});

describe("runPairing", () => {
  const link = { pairingId: ID, pairingToken: TOKEN, pin: PIN };
  it("offline: no key work, no relay call", async () => {
    const h = harness(); const out = await runPairing({ link, online: false, keygen: await realishKeygen(h.order), transport: h.transport, store: h.store, onStep: h.onStep });
    expect(out).toEqual({ ok: false, reason: "offline" });
    expect(h.order).toEqual([]);
  });
  it.each([
    ["ed25519_unsupported", "unsupported"], ["webcrypto_unavailable", "unsupported"], ["keygen_failed", "keygen_failed"],
  ] as const)("keygen %s -> %s and the relay is not called", async (reason, want) => {
    const h = harness(); const keygen: KeygenRunner = { async run() { return { ok: false, reason }; } };
    expect(await runPairing({ link, online: true, keygen, transport: h.transport, store: h.store, onStep: h.onStep })).toEqual({ ok: false, reason: want });
    expect(h.order).toEqual([]);
  });
  it.each([["expired"], ["rejected"], ["network"]] as const)("relay says %s: nothing is stored", async (reason) => {
    const h = harness({ exchange: async () => ({ ok: false, reason }) });
    const out = await runPairing({ link, online: true, keygen: await realishKeygen(h.order), transport: h.transport, store: h.store, onStep: h.onStep });
    expect(out.ok === false && out.reason).toBe(reason);
    expect(out.ok === false && out.fingerprint).toMatch(/^[0-9A-F]{4}-/);
    expect(h.order).toEqual(["keygen", "exchange"]);
  });
  it("a throwing transport is a network failure", async () => {
    const a = harness({ exchange: async () => { throw new Error("x"); } });
    expect((await runPairing({ link, online: true, keygen: await realishKeygen(a.order), transport: a.transport, store: a.store, onStep: a.onStep }))).toMatchObject({ ok: false, reason: "network" });
  });
});

describe("createFetchTransport", () => {
  const body = buildPairingExchangeBody(ID, TOKEN, { signingPublicKey: "s", encryptionPublicKey: "e" });
  const full = { deviceId: "d", deviceToken: "t", workspaceId: "w", memberId: "m" };
  const call = async (status: number, json: unknown) => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const f = (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(JSON.stringify(json), { status }); }) as unknown as typeof fetch;
    const out = await createFetchTransport({ baseUrl: "https://connect.example/", fetchImpl: f }).exchange(body);
    return { out, seen };
  };
  it("posts JSON with no cookies and no referrer to /v1/pairings/exchange", async () => {
    const { seen } = await call(200, full);
    expect(seen[0]?.url).toBe("https://connect.example/v1/pairings/exchange");
    expect(seen[0]?.init.method).toBe("POST");
    expect(seen[0]?.init.credentials).toBe("omit");
    expect(seen[0]?.init.referrerPolicy).toBe("no-referrer");
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual(body);
  });
  it("carries the desktop's keys and proof to the flow, and an absent proof as null", async () => {
    const a = await call(201, { ...full, shopId: "s", desktopSigningPublicKey: "SK", desktopEncryptionPublicKey: "RK", desktopKeyProof: "P" });
    expect(a.out).toEqual({ ok: true, ...full, shopId: "s", approval: "pending", desktopSigningPublicKey: "SK", desktopEncryptionPublicKey: "RK", desktopKeyProof: "P" });
    const b = await call(201, full);
    expect(b.out).toMatchObject({ ok: true, shopId: null, desktopSigningPublicKey: "", desktopEncryptionPublicKey: "", desktopKeyProof: null });
  });
  it.each([
    [200, full, "ok"], [200, { deviceId: "d", deviceToken: "t" }, "network"], [200, { nope: 1 }, "network"], [410, {}, "expired"], [404, {}, "expired"],
    [400, {}, "rejected"], [401, {}, "rejected"], [403, {}, "rejected"], [429, {}, "network"], [500, {}, "network"],
  ])("status %d %j -> %s", async (status, json, want) => {
    const { out } = await call(status, json);
    expect(out.ok ? "ok" : out.reason).toBe(want);
  });
  it("a fetch that throws is a network failure", async () => {
    const f = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    expect(await createFetchTransport({ baseUrl: "https://x/", fetchImpl: f }).exchange(body)).toEqual({ ok: false, reason: "network" });
  });
});
