// Test-only browser stand-in: decrypts a push body with WebCrypto, sharing no
// code with the library. Not a test file (the name has no ".test").
import { webcrypto } from "node:crypto";

const subtle = webcrypto.subtle;
const curve = { name: "ECDH", namedCurve: "P-256" };
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export type Receiver = {
  d: string;
  publicRaw: Uint8Array;
  authSecret: Uint8Array;
};

export async function newReceiver(): Promise<Receiver> {
  const kp = (await subtle.generateKey(curve, true, ["deriveBits"])) as webcrypto.CryptoKeyPair;
  const jwk = await subtle.exportKey("jwk", kp.privateKey);
  return {
    d: jwk.d ?? "",
    publicRaw: new Uint8Array(await subtle.exportKey("raw", kp.publicKey)),
    authSecret: webcrypto.getRandomValues(new Uint8Array(16)),
  };
}

async function hkdf(key: Uint8Array, salt: Uint8Array, info: Uint8Array, bits: number): Promise<Uint8Array> {
  const k = await subtle.importKey("raw", key, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bits));
}

/** Returns the plaintext bytes; throws if the record does not authenticate. */
export async function decryptBody(body: Uint8Array, r: Receiver): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const idlen = body[20] ?? 0;
  const asPublic = body.slice(21, 21 + idlen);
  const record = body.slice(21 + idlen);
  const priv = await subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: Buffer.from(r.publicRaw.slice(1, 33)).toString("base64url"),
      y: Buffer.from(r.publicRaw.slice(33, 65)).toString("base64url"),
      d: r.d,
    },
    curve,
    false,
    ["deriveBits"],
  );
  const pub = await subtle.importKey("raw", asPublic, curve, false, []);
  const secret = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256));
  const keyInfo = new Uint8Array([...utf8("WebPush: info\0"), ...r.publicRaw, ...asPublic]);
  const ikm = await hkdf(secret, r.authSecret, keyInfo, 256);
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\0"), 96);
  const aes = await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, record));
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end -= 1;
  if (plain[end - 1] !== 2) throw new Error("missing 0x02 delimiter");
  return plain.slice(0, end - 1);
}
