// @vitest-environment node
import { createPrivateKey } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalConnectedAadBytes, createConnectedEnvelope, openConnectedEnvelope } from "../../envelope";
import {
  connectedAadDigest,
  generateConnectedKeyPair,
  signConnectedBytes,
  verifyConnectedBytes,
  type ConnectedKeyPair,
} from "../../payload-crypto";
import { canonicalConnectedEnvelopeBytes, type ConnectedEnvelope } from "../../protocol";
import { base64Decode, base64Encode, utf8Decode } from "../bytes";
import { aadDigestHex, canonicalAadBytes, canonicalEnvelopeBytes } from "../canonical";
import { openEnvelopeWeb, sealEnvelopeWeb } from "../envelope-web";
import { importSigningPublicKey } from "../keys";
import { commandMetadata, flipBit, projectionMetadata } from "./helpers";

// golden-vectors.json is FROZEN. Keys in it are throw-away test keys, never used
// anywhere else. If a Node edit makes these tests fail, the wire format drifted:
// fix the code, do not regenerate the file. It is only written when it is missing.
const FILE = fileURLToPath(new URL("./golden-vectors.json", import.meta.url));

interface Party {
  signingPublicKey: string;
  signingPrivateJwk: JsonWebKey;
  encryptionPublicKeyJwk: string;
  encryptionPrivateJwk: JsonWebKey;
}
type Unsigned = Omit<ConnectedEnvelope, "signature">;
interface CanonicalCase {
  name: string;
  envelope: Unsigned;
  canonicalUtf8: string;
  aadUtf8: string;
  aadDigest: string;
  signature: string;
}
interface Sealed { now: string; payload: unknown; envelope: ConnectedEnvelope }
interface Vectors {
  notice: string;
  formatVersion: 1;
  desktop: Party;
  phone: Party;
  canonical: CanonicalCase[];
  projection: Sealed;
  command: Sealed;
}

function jwkOf(pkcs8Base64: string): JsonWebKey {
  return createPrivateKey({ key: Buffer.from(pkcs8Base64, "base64"), format: "der", type: "pkcs8" })
    .export({ format: "jwk" }) as JsonWebKey;
}

function pkcs8Of(jwk: JsonWebKey): string {
  return createPrivateKey({ key: jwk as never, format: "jwk" })
    .export({ format: "der", type: "pkcs8" }).toString("base64");
}

function party(keys: ConnectedKeyPair): Party {
  return {
    signingPublicKey: keys.signingPublicKey,
    signingPrivateJwk: jwkOf(keys.signingPrivateKeyPkcs8),
    encryptionPublicKeyJwk: keys.encryptionPublicKeyJwk,
    encryptionPrivateJwk: jwkOf(keys.encryptionPrivateKeyPkcs8),
  };
}

const signingKey = (jwk: JsonWebKey) => crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
const decryptKey = (jwk: JsonWebKey) =>
  crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);

async function generateVectors(): Promise<Vectors> {
  const desktopKeys = generateConnectedKeyPair();
  const phoneKeys = generateConnectedKeyPair();
  const desktop = party(desktopKeys);
  const phone = party(phoneKeys);
  const unsignedCases: Array<[string, Unsigned]> = [
    ["ascii", { ...projectionMetadata(), aadDigest: "ab".repeat(32), ciphertext: "QUJD" }],
    ["unicode and a large sequence", {
      ...projectionMetadata({ shopId: "متجر_12345678", sequence: Number.MAX_SAFE_INTEGER, messageType: "projection.é🙂" }),
      aadDigest: "01".repeat(32),
      ciphertext: "QUJDREVG",
    }],
  ];
  const canonical = unsignedCases.map(([name, envelope]): CanonicalCase => {
    const bytes = canonicalConnectedEnvelopeBytes(envelope);
    return {
      name,
      envelope,
      canonicalUtf8: new TextDecoder().decode(bytes),
      aadUtf8: new TextDecoder().decode(canonicalConnectedAadBytes(envelope)),
      aadDigest: connectedAadDigest(canonicalConnectedAadBytes(envelope)),
      signature: signConnectedBytes(desktopKeys.signingPrivateKeyPkcs8, bytes),
    };
  });
  const now = "2026-08-13T18:30:00.000Z";
  const projectionPayload = { orders: 12, revenueDzd: 1523000, label: "ملخص اليوم", items: [{ id: 1, name: "قميص" }] };
  const projection = createConnectedEnvelope(
    projectionMetadata({ sequence: 41 }),
    projectionPayload,
    phoneKeys.encryptionPublicKeyJwk,
    desktopKeys.signingPrivateKeyPkcs8,
  );
  const commandPayload = { action: "comments.write", text: "تم التأكيد ✓", orderId: "ord_12345678" };
  const command = await sealEnvelopeWeb(
    commandMetadata({ sequence: 17 }),
    commandPayload,
    desktopKeys.encryptionPublicKeyJwk,
    await signingKey(phone.signingPrivateJwk),
  );
  return {
    notice: "TEST-ONLY keys and messages for the web protocol port. Frozen: never regenerate to make a test pass.",
    formatVersion: 1,
    desktop,
    phone,
    canonical,
    projection: { now, payload: projectionPayload, envelope: projection },
    command: { now, payload: commandPayload, envelope: command },
  };
}

function load(): Vectors {
  return JSON.parse(readFileSync(FILE, "utf8")) as Vectors;
}

describe("golden vectors (frozen, both directions)", () => {
  it("writes the vector file once when it is missing, then asks for a review", async () => {
    if (existsSync(FILE)) return;
    writeFileSync(FILE, `${JSON.stringify(await generateVectors(), null, 2)}\n`);
    throw new Error("golden-vectors.json was missing and has been generated: review and commit it, then rerun");
  }, 120_000);

  it("keeps canonical bytes, AAD, digest and signature identical in Node and the web port", async () => {
    const vectors = load();
    const verifyKey = await importSigningPublicKey(vectors.desktop.signingPublicKey);
    expect(verifyKey).not.toBeNull();
    const privateKey = await signingKey(vectors.desktop.signingPrivateJwk);
    for (const item of vectors.canonical) {
      expect(utf8Decode(canonicalEnvelopeBytes(item.envelope)), item.name).toBe(item.canonicalUtf8);
      expect(utf8Decode(canonicalConnectedEnvelopeBytes(item.envelope)), item.name).toBe(item.canonicalUtf8);
      expect(utf8Decode(canonicalAadBytes(item.envelope)), item.name).toBe(item.aadUtf8);
      expect(utf8Decode(canonicalConnectedAadBytes(item.envelope)), item.name).toBe(item.aadUtf8);
      expect(await aadDigestHex(canonicalAadBytes(item.envelope))).toBe(item.aadDigest);
      const bytes = canonicalEnvelopeBytes(item.envelope);
      expect(verifyConnectedBytes(vectors.desktop.signingPublicKey, item.signature, bytes)).toBe(true);
      const signature = base64Decode(item.signature) ?? new Uint8Array();
      expect(await crypto.subtle.verify({ name: "Ed25519" }, verifyKey as CryptoKey, signature, bytes)).toBe(true);
      // Ed25519 is deterministic, so both implementations must sign to the same bytes.
      expect(base64Encode(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, privateKey, bytes)))).toBe(item.signature);
      expect(signConnectedBytes(pkcs8Of(vectors.desktop.signingPrivateJwk), bytes)).toBe(item.signature);
    }
  });

  it("opens the projection that Node sealed once", async () => {
    const vectors = load();
    const now = new Date(vectors.projection.now);
    const web = await openEnvelopeWeb(
      vectors.projection.envelope,
      vectors.desktop.signingPublicKey,
      await decryptKey(vectors.phone.encryptionPrivateJwk),
      { now, expect: { recipientId: "device_12345678", deviceId: "device_12345678", sequence: 41 } },
    );
    expect(web).toEqual({ ok: true, envelope: vectors.projection.envelope, payload: vectors.projection.payload });
    const node = openConnectedEnvelope(
      vectors.projection.envelope,
      vectors.desktop.signingPublicKey,
      pkcs8Of(vectors.phone.encryptionPrivateJwk),
      now,
    );
    expect(node.payload).toEqual(vectors.projection.payload);
  });

  it("opens the command that the web port sealed once, in Node and in the web port", async () => {
    const vectors = load();
    const now = new Date(vectors.command.now);
    const node = openConnectedEnvelope(
      vectors.command.envelope,
      vectors.phone.signingPublicKey,
      pkcs8Of(vectors.desktop.encryptionPrivateJwk),
      now,
    );
    expect(node.payload).toEqual(vectors.command.payload);
    const web = await openEnvelopeWeb(
      vectors.command.envelope,
      vectors.phone.signingPublicKey,
      await decryptKey(vectors.desktop.encryptionPrivateJwk),
      { now, expect: { sequence: 17 } },
    );
    expect(web.ok && web.payload).toEqual(vectors.command.payload);
  });

  it("still refuses tampering and expiry on the frozen messages", async () => {
    const vectors = load();
    const key = await decryptKey(vectors.phone.encryptionPrivateJwk);
    const envelope = vectors.projection.envelope;
    const now = new Date(vectors.projection.now);
    expect(await openEnvelopeWeb({ ...envelope, signature: flipBit(envelope.signature, 7) }, vectors.desktop.signingPublicKey, key, { now }))
      .toEqual({ ok: false, reason: "bad_signature" });
    expect(await openEnvelopeWeb(envelope, vectors.desktop.signingPublicKey, key, { now: Date.parse(envelope.expiresAt) }))
      .toEqual({ ok: false, reason: "expired" });
  });
});
