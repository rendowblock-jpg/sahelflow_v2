import { webcrypto } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  EncryptError,
  HEADER_BYTES,
  PADDED_RECORD_BYTES,
  deriveContentKeys,
  encryptPayload,
} from "../encrypt";

const subtle = webcrypto.subtle;
const b64 = (s: string): Buffer => Buffer.from(s, "base64url");
const enc = (b: Uint8Array): string => Buffer.from(b).toString("base64url");
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

// RFC 8291 appendix A. Public test values, safe to keep in the repository.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  ecdhSecret: "kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs",
  ikm: "S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg",
  cek: "oIhVW04MRdy2XN9CiKLxTg",
  nonce: "4h_95klXJ5E_qnoN",
  // The RFC prints the 86-byte header and the ciphertext as two base64url
  // strings; they cannot be joined as text (86 is not a multiple of 3).
  header:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  ciphertext:
    "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
};

type Receiver = { d: string; publicRaw: Uint8Array };

// Independent receiver: WebCrypto only, shares no code with the library.
async function hkdf(
  key: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  bits: number,
): Promise<Uint8Array> {
  const k = await subtle.importKey("raw", key, "HKDF", false, ["deriveBits"]);
  const out = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    k,
    bits,
  );
  return new Uint8Array(out);
}

async function receive(
  body: Uint8Array,
  ua: Receiver,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(16);
  const idlen = body[20] ?? 0;
  const asPublic = body.slice(21, 21 + idlen);
  const record = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  expect(idlen).toBe(65);
  const curve = { name: "ECDH", namedCurve: "P-256" };
  const priv = await subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: enc(ua.publicRaw.slice(1, 33)),
      y: enc(ua.publicRaw.slice(33, 65)),
      d: ua.d,
    },
    curve,
    false,
    ["deriveBits"],
  );
  const pub = await subtle.importKey("raw", asPublic, curve, false, []);
  const secret = new Uint8Array(
    await subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256),
  );
  const keyInfo = new Uint8Array([
    ...utf8("WebPush: info\0"),
    ...ua.publicRaw,
    ...asPublic,
  ]);
  const ikm = await hkdf(secret, authSecret, keyInfo, 256);
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\0"), 96);
  const aes = await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, record),
  );
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end -= 1;
  expect(plain[end - 1]).toBe(2);
  return plain.slice(0, end - 1);
}

async function newReceiver(): Promise<Receiver> {
  const kp = (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as webcrypto.CryptoKeyPair;
  const jwk = await subtle.exportKey("jwk", kp.privateKey);
  const publicRaw = new Uint8Array(await subtle.exportKey("raw", kp.publicKey));
  return { d: jwk.d ?? "", publicRaw };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof EncryptError) return error.code;
    return "other:" + String(error);
  }
  return "no-throw";
}

const rfcInput = {
  plaintext: Buffer.from(RFC.plaintext),
  uaPublic: b64(RFC.uaPublic),
  authSecret: b64(RFC.authSecret),
  asKeyPair: { privateKey: b64(RFC.asPrivate) },
  salt: b64(RFC.salt),
};

describe("RFC 8291 appendix A vector", () => {
  it("derives the published ecdh_secret, IKM, CEK and NONCE", () => {
    const k = deriveContentKeys({
      asPrivate: b64(RFC.asPrivate),
      uaPublic: b64(RFC.uaPublic),
      authSecret: b64(RFC.authSecret),
      salt: b64(RFC.salt),
    });
    expect(enc(k.asPublic)).toBe(RFC.asPublic);
    expect(enc(k.ecdhSecret)).toBe(RFC.ecdhSecret);
    expect(enc(k.ikm)).toBe(RFC.ikm);
    expect(enc(k.cek)).toBe(RFC.cek);
    expect(enc(k.nonce)).toBe(RFC.nonce);
  });

  it("produces the published header and ciphertext with padding switched off", () => {
    const body = encryptPayload({ ...rfcInput, padTo: 0 });
    expect(body.length).toBe(144);
    expect(enc(body.subarray(0, HEADER_BYTES))).toBe(RFC.header);
    expect(enc(body.subarray(HEADER_BYTES))).toBe(RFC.ciphertext);
  });

  it("is decrypted by the independent receiver with the published ua_private", async () => {
    const body = encryptPayload({ ...rfcInput, padTo: 0 });
    const plain = await receive(
      body,
      { d: RFC.uaPrivate, publicRaw: b64(RFC.uaPublic) },
      b64(RFC.authSecret),
    );
    expect(Buffer.from(plain).toString("utf8")).toBe(RFC.plaintext);
  });
});

describe("production default padding", () => {
  it("pads every record to a constant 256 bytes, so every body is 358 bytes", async () => {
    expect(PADDED_RECORD_BYTES).toBe(256);
    const receiver = await newReceiver();
    const authSecret = webcrypto.getRandomValues(new Uint8Array(16));
    const sizes = new Set<number>();
    for (const len of [0, 1, 10, 60, 200, 255]) {
      const data = new Uint8Array(len).fill(0x41);
      const body = encryptPayload({ plaintext: data, uaPublic: receiver.publicRaw, authSecret });
      sizes.add(body.length);
    }
    expect([...sizes]).toEqual([HEADER_BYTES + 256 + 16]);
    expect(HEADER_BYTES + 256 + 16).toBe(358);
  });

  it("refuses a plaintext that cannot fit the padded record", async () => {
    const receiver = await newReceiver();
    const authSecret = webcrypto.getRandomValues(new Uint8Array(16));
    const base = { uaPublic: receiver.publicRaw, authSecret };
    expect(encryptPayload({ ...base, plaintext: new Uint8Array(255) }).length).toBe(358);
    expect(codeOf(() => encryptPayload({ ...base, plaintext: new Uint8Array(256) }))).toBe(
      "too_large",
    );
  });
});

describe("round trip against the independent receiver", () => {
  it("returns the exact bytes, also with 0x00 and 0x02 inside the data", async () => {
    const receiver = await newReceiver();
    const authSecret = webcrypto.getRandomValues(new Uint8Array(16));
    const samples: Uint8Array[] = [
      utf8('{"v":1,"k":"orders","n":5,"t":1790000000,"id":"0123456789abcdef"}'),
      new Uint8Array([2]),
      new Uint8Array([0, 2, 0, 0, 2, 7, 0]),
      utf8("é".repeat(100)),
    ];
    for (const plaintext of samples) {
      const body = encryptPayload({ plaintext, uaPublic: receiver.publicRaw, authSecret });
      const plain = await receive(body, receiver, authSecret);
      expect(Buffer.from(plain).equals(Buffer.from(plaintext))).toBe(true);
    }
  });

  it("uses a fresh salt and a fresh ephemeral key on every call", async () => {
    const receiver = await newReceiver();
    const authSecret = webcrypto.getRandomValues(new Uint8Array(16));
    const input = { plaintext: utf8("same"), uaPublic: receiver.publicRaw, authSecret };
    const a = encryptPayload(input);
    const b = encryptPayload(input);
    expect(a.subarray(0, 16).equals(b.subarray(0, 16))).toBe(false);
    expect(a.subarray(21, 86).equals(b.subarray(21, 86))).toBe(false);
    expect(a[21]).toBe(0x04);
    expect(a.readUInt32BE(16)).toBe(4096);
    expect(a[20]).toBe(65);
  });
});

describe("size limits", () => {
  it("keeps an unpadded body at or below 4096 and refuses one byte more", async () => {
    const receiver = await newReceiver();
    const authSecret = webcrypto.getRandomValues(new Uint8Array(16));
    const base = { uaPublic: receiver.publicRaw, authSecret, padTo: 0 };
    const biggest = encryptPayload({ ...base, plaintext: new Uint8Array(3993) });
    expect(biggest.length).toBe(4096);
    expect(codeOf(() => encryptPayload({ ...base, plaintext: new Uint8Array(3994) }))).toBe(
      "too_large",
    );
  });

  it("refuses a padTo that would exceed the body limit", async () => {
    const receiver = await newReceiver();
    const authSecret = webcrypto.getRandomValues(new Uint8Array(16));
    const code = codeOf(() =>
      encryptPayload({
        plaintext: utf8("x"),
        uaPublic: receiver.publicRaw,
        authSecret,
        padTo: 4000,
      }),
    );
    expect(code).toBe("too_large");
  });
});

describe("input validation", () => {
  it("rejects bad keys, secrets and salts with a typed error", async () => {
    const receiver = await newReceiver();
    const good = {
      plaintext: utf8("x"),
      uaPublic: receiver.publicRaw,
      authSecret: new Uint8Array(16).fill(7),
    };
    expect(codeOf(() => encryptPayload({ ...good, uaPublic: receiver.publicRaw.slice(0, 64) }))).toBe(
      "bad_public_key",
    );
    const compressed = new Uint8Array(33).fill(1);
    compressed[0] = 2;
    expect(codeOf(() => encryptPayload({ ...good, uaPublic: compressed }))).toBe("bad_public_key");
    const offCurve = new Uint8Array(65).fill(1);
    offCurve[0] = 4;
    expect(codeOf(() => encryptPayload({ ...good, uaPublic: offCurve }))).toBe("bad_public_key");
    expect(codeOf(() => encryptPayload({ ...good, authSecret: new Uint8Array(15) }))).toBe(
      "bad_auth_secret",
    );
    expect(codeOf(() => encryptPayload({ ...good, salt: new Uint8Array(17) }))).toBe("bad_salt");
    expect(
      codeOf(() => encryptPayload({ ...good, asKeyPair: { privateKey: new Uint8Array(31).fill(3) } })),
    ).toBe("bad_private_key");
    expect(codeOf(() => encryptPayload({ ...good, padTo: -1 }))).toBe("bad_option");
    expect(codeOf(() => encryptPayload({ ...good, padTo: 1.5 }))).toBe("bad_option");
  });

  it("never puts key material in an error message", () => {
    try {
      encryptPayload({
        plaintext: utf8("x"),
        uaPublic: b64(RFC.uaPublic).slice(0, 10),
        authSecret: b64(RFC.authSecret),
      });
    } catch (error) {
      const text = String((error as Error).message);
      expect(text).not.toContain(RFC.uaPublic.slice(0, 12));
      expect(text).not.toContain(RFC.authSecret);
    }
  });
});
