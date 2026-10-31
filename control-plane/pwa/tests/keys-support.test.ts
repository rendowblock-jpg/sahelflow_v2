import { describe, expect, it, vi } from "vitest";
import { generateDeviceKeys, supportsEd25519 } from "../../../src/lib/connected-platform/web";
import { runPairing } from "../src/pair/flow";
import { saveDeviceKeys, type Db } from "../src/storage/idb";

// A WebView whose subtle crypto has no Ed25519.
const oldSubtle = { generateKey: async () => { throw new Error("NotSupportedError"); } } as unknown as SubtleCrypto;

describe("keys at rest and old WebViews", () => {
  it("detects the missing Ed25519 without throwing", async () => {
    expect(await supportsEd25519(oldSubtle)).toBe(false);
    expect(await generateDeviceKeys({ subtle: oldSubtle })).toEqual({ ok: false, reason: "ed25519_unsupported" });
  });
  it("pairing on such a WebView ends as the typed 'unsupported' state before any relay call or save", async () => {
    const exchange = vi.fn(); const touched = vi.fn();
    const out = await runPairing({
      link: { pairingId: "0123456789abcdef0123456789abcdef", pairingToken: "x", pin: "AAAA-BBBB-CCCC-DDDD" }, online: true, onStep: () => undefined,
      keygen: { run: () => generateDeviceKeys({ subtle: oldSubtle }) }, transport: { exchange },
      store: { saveKeys: touched, saveTrust: touched, saveCredentials: touched, discard: touched },
    });
    expect(out).toEqual({ ok: false, reason: "unsupported" });
    expect(exchange).not.toHaveBeenCalled(); expect(touched).not.toHaveBeenCalled();
  });
  it("the phone's private keys are non-extractable CryptoKeys, and an extractable one is refused at rest", async () => {
    const made = await generateDeviceKeys(); if (!made.ok) throw new Error("setup");
    expect(made.keys.signing.privateKey.extractable).toBe(false); expect(made.keys.encryption.privateKey.extractable).toBe(false);
    const put = vi.fn(); const db = { put } as unknown as Db;
    const loose = { signing: { ...made.keys.signing, privateKey: { extractable: true } }, encryption: made.keys.encryption } as unknown as typeof made.keys;
    await expect(saveDeviceKeys(db, loose)).rejects.toThrow("extractable_private_key");
    expect(put).not.toHaveBeenCalled();
  });
});
