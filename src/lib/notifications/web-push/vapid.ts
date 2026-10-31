// VAPID (RFC 8292): the signed header that tells a push service who sends.
import { createECDH, createPrivateKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";

import { base64urlDecode, base64urlEncode } from "./util";

export const VAPID_DEFAULT_TTL_SECONDS = 12 * 3600;
export const VAPID_MAX_TTL_SECONDS = 24 * 3600;

export type VapidKeys = {
  /** 65-byte uncompressed P-256 point, base64url. Goes to the phone. */
  publicKey: string;
  /** 32-byte scalar, base64url. Stays on the PC, sealed. */
  privateKey: string;
};

export type VapidErrorCode = "bad_key" | "bad_subject" | "bad_endpoint" | "bad_ttl" | "bad_now";

// Messages are fixed text: they never carry a key or an address.
export class VapidError extends Error {
  readonly code: VapidErrorCode;

  constructor(code: VapidErrorCode, message: string) {
    super(message);
    this.name = "VapidError";
    this.code = code;
  }
}

export type VapidHeaderInput = {
  endpoint: string;
  privateKey: string;
  publicKey: string;
  /** An https URL of the app. Never an e-mail address. */
  subject: string;
  /** Epoch milliseconds. */
  now: number;
  /** Lifetime of the token, 1 s to 24 h. Default 12 h. */
  ttlSeconds?: number;
};

export function generateVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const x = base64urlDecode(jwk.x ?? "");
  const y = base64urlDecode(jwk.y ?? "");
  if (!x || !y || x.length !== 32 || y.length !== 32 || !jwk.d) {
    throw new VapidError("bad_key", "Could not export the generated key pair.");
  }
  return {
    publicKey: base64urlEncode(Buffer.concat([Buffer.from([4]), x, y])),
    privateKey: jwk.d,
  };
}

function importPrivateKey(privateKey: string, publicKey: string): KeyObject {
  const d = base64urlDecode(privateKey);
  const point = base64urlDecode(publicKey);
  if (!d || d.length !== 32 || !point || point.length !== 65 || point[0] !== 4) {
    throw new VapidError("bad_key", "VAPID keys have the wrong format.");
  }
  // A public key that does not belong to the private key would be answered with 403.
  const ecdh = createECDH("prime256v1");
  try {
    ecdh.setPrivateKey(d);
  } catch {
    throw new VapidError("bad_key", "VAPID private key is not valid for P-256.");
  }
  if (!ecdh.getPublicKey().equals(point)) {
    throw new VapidError("bad_key", "VAPID public key does not match the private key.");
  }
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: base64urlEncode(point.subarray(1, 33)),
      y: base64urlEncode(point.subarray(33, 65)),
      d: privateKey,
    },
    format: "jwk",
  });
}

function httpsUrl(text: string): URL | null {
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.username === "" && url.password === "" ? url : null;
  } catch {
    return null;
  }
}

/** Returns the Authorization header value: `vapid t=<jwt>, k=<public key>`. */
export function buildVapidHeader(input: VapidHeaderInput): string {
  if (typeof input.now !== "number" || !Number.isFinite(input.now) || input.now < 0) {
    throw new VapidError("bad_now", "now must be a time in milliseconds.");
  }
  const ttl = input.ttlSeconds === undefined ? VAPID_DEFAULT_TTL_SECONDS : input.ttlSeconds;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > VAPID_MAX_TTL_SECONDS) {
    throw new VapidError("bad_ttl", "Token lifetime must be 1 second to 24 hours.");
  }
  const endpoint = httpsUrl(input.endpoint);
  if (!endpoint) throw new VapidError("bad_endpoint", "Endpoint must be an https URL.");
  if (!httpsUrl(input.subject)) throw new VapidError("bad_subject", "Subject must be an https URL.");
  const key = importPrivateKey(input.privateKey, input.publicKey);

  const header = base64urlEncode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64urlEncode(
    Buffer.from(
      JSON.stringify({
        aud: endpoint.origin,
        exp: Math.floor(input.now / 1000) + ttl,
        sub: input.subject,
      }),
    ),
  );
  const signingInput = header + "." + claims;
  const signature = sign("sha256", Buffer.from(signingInput, "utf8"), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return "vapid t=" + signingInput + "." + base64urlEncode(signature) + ", k=" + input.publicKey;
}
