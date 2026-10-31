import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildDesktopPairingLink } from "../../../src/lib/connected-platform/pairing-link";
import { encodeDesktopKeyProof, importDesktopSigningPrivateKey, signDesktopEncryptionKey } from "../../../src/lib/connected-platform/pairing-trust";
import { generateConnectedKeyPair, type ConnectedKeyPair } from "../../../src/lib/connected-platform/payload-crypto";
import { base64UrlEncode, generateDeviceKeys, type DeviceKeys, type DevicePublicKeys } from "../../../src/lib/connected-platform/web";
import { catalogs, LOCALES, type Locale } from "../src/i18n";
import { runPairing, takePairingLink, TRUST_REFUSALS, type ExchangeResult, type KeygenRunner, type PairStore, type TrustRefusal } from "../src/pair/flow";
import { esc, renderApp, type View } from "../src/views/view";
import { generateKeyPairSync } from "node:crypto";

const ID = "0123456789abcdef0123456789abcdef";
const TOKEN = base64UrlEncode(new Uint8Array(32).fill(7));
let desktop: ConnectedKeyPair; let other: ConnectedKeyPair; let phone: { keys: DeviceKeys; publicKeys: DevicePublicKeys };
let pin = ""; let rsa = ""; let goodProof = "";

const rsaJwk = (): string => {
  const jwk = generateKeyPairSync("rsa", { modulusLength: 3072 }).publicKey.export({ format: "jwk" });
  return JSON.stringify({ kty: jwk.kty, n: jwk.n, e: jwk.e });
};
async function proofFor(rsaJwkText: string, pkcs8: string, context?: string): Promise<string> {
  const key = await importDesktopSigningPrivateKey(pkcs8); if (!key) throw new Error("setup: key");
  const signed = await signDesktopEncryptionKey(rsaJwkText, key); if (!signed.ok) throw new Error("setup: sign");
  const proof = encodeDesktopKeyProof(signed.signature, context ?? signed.context); if (!proof) throw new Error("setup: proof");
  return proof;
}
beforeAll(async () => {
  desktop = generateConnectedKeyPair(); other = generateConnectedKeyPair();
  rsa = desktop.encryptionPublicKeyJwk; goodProof = await proofFor(rsa, desktop.signingPrivateKeyPkcs8);
  const made = await generateDeviceKeys(); if (!made.ok) throw new Error("setup: phone keys");
  phone = { keys: made.keys, publicKeys: made.publicKeys };
  const link = await buildDesktopPairingLink({ pairingId: ID, pairingToken: TOKEN, desktopSigningPublicKey: desktop.signingPublicKey });
  if (!link) throw new Error("setup: link");
  const taken = takePairingLink(link.hash, "/", () => undefined); if (taken.kind !== "link") throw new Error("setup: take");
  pin = taken.link.pin;
}, 120_000);
afterEach(() => vi.unstubAllGlobals());

const keygen: KeygenRunner = { async run(onStep) { onStep("signing"); onStep("encryption"); return { ok: true, keys: phone.keys, publicKeys: phone.publicKeys }; } };
const reply = (over: Partial<Extract<ExchangeResult, { ok: true }>> = {}): ExchangeResult => ({
  ok: true, deviceId: "phone_1", deviceToken: "SECRET-DEVICE-TOKEN", workspaceId: "ws_1", memberId: "member_1", shopId: "shop_1", approval: "pending",
  desktopSigningPublicKey: desktop.signingPublicKey, desktopEncryptionPublicKey: rsa, desktopKeyProof: goodProof, ...over,
});
async function run(res: () => ExchangeResult | Promise<ExchangeResult>) {
  const calls: string[] = []; const saved: unknown[] = [];
  const store: PairStore = {
    async saveKeys() { calls.push("saveKeys"); }, async saveTrust(t) { calls.push("saveTrust"); saved.push(t); },
    async saveCredentials(c) { calls.push("saveCredentials"); saved.push(c); }, async discard() { calls.push("discard"); },
  };
  const out = await runPairing({
    link: { pairingId: ID, pairingToken: TOKEN, pin }, online: true, keygen, store, onStep: () => undefined,
    transport: { async exchange() { calls.push("exchange"); return res(); } },
  });
  return { out, calls, saved };
}

describe("the desktop's key is judged against the pin BEFORE anything is stored", () => {
  it("a good proof: stores keys, then the verified desktop, then the credentials", async () => {
    const { out, calls, saved } = await run(() => reply());
    expect(out).toMatchObject({ ok: true, approval: "pending" });
    expect(calls).toEqual(["exchange", "saveKeys", "saveTrust", "saveCredentials"]);
    expect(saved[0]).toMatchObject({ signingPublicKey: desktop.signingPublicKey, signingFingerprint: pin });
    expect(saved[1]).toMatchObject({ deviceId: "phone_1", workspaceId: "ws_1", memberId: "member_1", shopId: "shop_1" });
  });
  const cases: ReadonlyArray<readonly [TrustRefusal, () => Promise<Partial<Extract<ExchangeResult, { ok: true }>>>]> = [
    ["proof_missing", async () => ({ desktopKeyProof: null })],
    ["bad_signature", async () => ({ desktopKeyProof: await proofFor(rsa, other.signingPrivateKeyPkcs8) })],
    ["key_mismatch_with_pin", async () => ({ desktopSigningPublicKey: other.signingPublicKey, desktopKeyProof: await proofFor(rsa, other.signingPrivateKeyPkcs8) })],
    ["wrong_context", async () => ({ desktopKeyProof: await proofFor(rsa, desktop.signingPrivateKeyPkcs8, "sahelflow.pairing.rsa-key.v0") })],
    ["malformed", async () => ({ desktopKeyProof: "not-a-proof" })],
  ];
  it.each(cases)("%s: refused, nothing stored, the generated keys are thrown away", async (reason, make) => {
    const over = await make();
    const { out, calls } = await run(() => reply(over));
    expect(out).toMatchObject({ ok: false, reason });
    expect(calls).toEqual(["exchange", "discard"]);
  });
  it("a relay that swaps the RSA key (keeps the old proof) is bad_signature", async () => {
    const { out, calls } = await run(() => reply({ desktopEncryptionPublicKey: rsaJwk() }));
    expect(out).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(calls).toEqual(["exchange", "discard"]);
  });
  it("a relay that sends no keys at all is a typed refusal, not a network error", async () => {
    const { out } = await run(() => reply({ desktopEncryptionPublicKey: "", desktopSigningPublicKey: "" }));
    expect(out).toMatchObject({ ok: false, reason: "malformed" });
  });
  it("unavailable: WebCrypto gone when the proof is checked", async () => {
    const { out, calls } = await run(() => { vi.stubGlobal("crypto", {}); return reply(); });
    expect(out).toMatchObject({ ok: false, reason: "unavailable" });
    expect(calls).toEqual(["exchange", "discard"]);
  });
  it("covers every reason the verifier can give", () => {
    expect([...TRUST_REFUSALS].sort()).toEqual(["bad_signature", "key_mismatch_with_pin", "malformed", "proof_missing", "unavailable", "wrong_context"]);
  });
  it("a link without the pin is not a link (the pin is the whole point)", () => {
    expect(takePairingLink(`#p=${ID}.${TOKEN}`, "/", () => undefined)).toEqual({ kind: "invalid" });
  });
});

const base = (locale: Locale): View => ({
  locale, theme: "system", screen: "pair", state: "error", now: Date.UTC(2026, 9, 30), online: true, updateReady: false, canInstall: false, installed: false, ios: false,
  projection: null, step: null, fingerprint: "AAAA-BBBB-CCCC-DDDD", failure: null, lockMode: "enter", lockNotice: null, hasLock: false,
  version: "0.1.0", confirmRemove: false, removeError: null, removed: false,
});
describe("each refusal has its own screen in ar, fr and en", () => {
  for (const locale of LOCALES) {
    it(`${locale}: typed text, the one honest instruction, no retry, no generic error`, () => {
      const bodies = new Set<string>();
      for (const reason of TRUST_REFUSALS) {
        const html = renderApp({ ...base(locale), failure: reason });
        const own = catalogs[locale][`pair.trust.${reason}`]; const instruction = catalogs[locale]["pair.trust.instruction"];
        expect(own, `${locale} pair.trust.${reason}`).toBeTruthy(); expect(instruction).toBeTruthy();
        expect(html).toContain(esc(own ?? "?")); expect(html).toContain(esc(instruction ?? "?")); expect(html).toContain(esc(catalogs[locale]["pair.trust.title"] ?? "?"));
        expect(html).not.toContain('data-act="retry"'); expect(html).not.toContain("{{");
        expect(html).not.toContain(catalogs[locale]["pair.error.network"] ?? "?");
        bodies.add(own ?? "");
      }
      expect(bodies.size).toBe(TRUST_REFUSALS.length);
    });
  }
});

describe("a failed save", () => {
  it("is storage_failed, the phone discards what it saved, and the pairing is reported with its fingerprint", async () => {
    const calls: string[] = [];
    const store: PairStore = {
      async saveKeys() { calls.push("saveKeys"); }, async saveTrust() { throw new Error("quota"); },
      async saveCredentials() { calls.push("saveCredentials"); }, async discard() { calls.push("discard"); },
    };
    const out = await runPairing({ link: { pairingId: ID, pairingToken: TOKEN, pin }, online: true, keygen, store, onStep: () => undefined, transport: { async exchange() { return reply(); } } });
    expect(out).toMatchObject({ ok: false, reason: "storage_failed" });
    expect(calls).toEqual(["saveKeys", "discard"]);
  });
});
