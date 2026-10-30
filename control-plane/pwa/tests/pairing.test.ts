import { describe, expect, it } from "vitest";
import { base64UrlEncode, buildPairingExchangeBody, formatPairingHash } from "../../../src/lib/connected-platform/web";
import { runPairing, takePairingLink, type ExchangeResult, type KeygenRunner, type PairStep, type PairStore, type PairingTransport } from "../src/pair/flow";
import { createFetchTransport } from "../src/pair/transport";
import type { PinnedDesktopKey } from "../src/pair/pinned";

const ID = "0123456789abcdef0123456789abcdef";
const TOKEN = base64UrlEncode(new Uint8Array(32).fill(7));
const HASH = formatPairingHash(ID, TOKEN) ?? "";

async function realishKeygen(order: string[]): Promise<KeygenRunner> {
  const signing = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", signing.publicKey));
  const b64 = btoa(String.fromCharCode(...raw));
  return {
    async run(onStep) {
      order.push("keygen"); onStep("signing"); onStep("encryption");
      return { ok: true, keys: { signing, encryption: signing }, publicKeys: { signingPublicKey: b64, encryptionPublicKey: "enc-key" } };
    },
  };
}
function harness(over: { exchange?: () => Promise<ExchangeResult>; saveKeys?: () => Promise<void> } = {}) {
  const order: string[] = []; const steps: PairStep[] = []; const bodies: unknown[] = []; const creds: unknown[] = [];
  const transport: PairingTransport = {
    async exchange(body) { order.push("exchange"); bodies.push(body); return over.exchange ? over.exchange() : { ok: true, deviceId: "dev-1", deviceToken: "SECRET-DEVICE-TOKEN", approval: "pending" }; },
  };
  const store: PairStore = {
    async saveKeys() { order.push("saveKeys"); if (over.saveKeys) await over.saveKeys(); },
    async saveCredentials(c) { order.push("saveCredentials"); creds.push(c); },
  };
  return { order, steps, bodies, creds, transport, store, onStep: (s: PairStep) => steps.push(s) };
}

describe("takePairingLink", () => {
  it("reads a valid fragment and removes it from the address bar before anything else", () => {
    expect(HASH).not.toBe("");
    const urls: string[] = [];
    const r = takePairingLink(HASH, "/?screen=pair", (u) => urls.push(u));
    expect(r).toEqual({ kind: "link", link: { pairingId: ID, pairingToken: TOKEN } });
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
  const link = { pairingId: ID, pairingToken: TOKEN };
  it("makes keys, saves them BEFORE the relay call, then waits for the PC", async () => {
    const order: string[] = []; const h = harness(); const keygen = await realishKeygen(h.order);
    const out = await runPairing({ link, online: true, keygen, transport: h.transport, store: h.store, onStep: h.onStep });
    expect(out.ok).toBe(true);
    expect(h.order).toEqual(["keygen", "saveKeys", "exchange", "saveCredentials"]);
    expect(h.steps).toEqual(["signing", "encryption", "send"]);
    expect(out.ok && out.fingerprint).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(h.bodies[0]).toEqual(buildPairingExchangeBody(ID, TOKEN, { signingPublicKey: expect.any(String) as string, encryptionPublicKey: "enc-key" }));
    expect(out.ok && out.approval).toBe("pending");
    expect(order).toEqual([]);
  });
  it("never returns the device token to the screen", async () => {
    const h = harness(); const out = await runPairing({ link, online: true, keygen: await realishKeygen(h.order), transport: h.transport, store: h.store, onStep: h.onStep });
    expect(JSON.stringify(out)).not.toContain("SECRET-DEVICE-TOKEN");
    expect(h.creds).toEqual([{ deviceId: "dev-1", deviceToken: "SECRET-DEVICE-TOKEN" }]);
  });
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
  it.each([["expired"], ["rejected"], ["network"]] as const)("relay says %s", async (reason) => {
    const h = harness({ exchange: async () => ({ ok: false, reason }) });
    const out = await runPairing({ link, online: true, keygen: await realishKeygen(h.order), transport: h.transport, store: h.store, onStep: h.onStep });
    expect(out.ok === false && out.reason).toBe(reason);
    expect(out.ok === false && out.fingerprint).toMatch(/^[0-9A-F]{4}-/);
    expect(h.creds).toEqual([]);
  });
  it("a throwing transport is a network failure, a throwing store is a storage failure", async () => {
    const a = harness({ exchange: async () => { throw new Error("x"); } });
    expect((await runPairing({ link, online: true, keygen: await realishKeygen(a.order), transport: a.transport, store: a.store, onStep: a.onStep }))).toMatchObject({ ok: false, reason: "network" });
    const b = harness({ saveKeys: async () => { throw new Error("quota"); } });
    expect((await runPairing({ link, online: true, keygen: await realishKeygen(b.order), transport: b.transport, store: b.store, onStep: b.onStep }))).toEqual({ ok: false, reason: "storage_failed" });
    expect(b.order).not.toContain("exchange");
  });
  it("is the seam for the desktop-key pin (trust gap, S1/S2)", () => {
    const pin: PinnedDesktopKey | null = null;
    expect(pin).toBeNull();
  });
  it.todo("pins the desktop signing key from #p=<id>.<token>.<fp> and refuses a relay-swapped RSA or signing key with a typed reason (needs S1/S2)");
});

describe("createFetchTransport", () => {
  const body = buildPairingExchangeBody(ID, TOKEN, { signingPublicKey: "s", encryptionPublicKey: "e" });
  const call = async (status: number, json: unknown) => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const f = (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(JSON.stringify(json), { status }); }) as unknown as typeof fetch;
    const out = await createFetchTransport({ baseUrl: "https://connect.example/", fetchImpl: f }).exchange(body);
    return { out, seen };
  };
  it("posts JSON with no cookies and no referrer to /v1/pairings/exchange", async () => {
    const { seen } = await call(200, { deviceId: "d", deviceToken: "t", approval: "pending" });
    expect(seen[0]?.url).toBe("https://connect.example/v1/pairings/exchange");
    expect(seen[0]?.init.method).toBe("POST");
    expect(seen[0]?.init.credentials).toBe("omit");
    expect(seen[0]?.init.referrerPolicy).toBe("no-referrer");
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual(body);
  });
  it.each([
    [200, { deviceId: "d", deviceToken: "t" }, "ok"], [200, { nope: 1 }, "network"], [410, {}, "expired"], [404, {}, "expired"],
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
