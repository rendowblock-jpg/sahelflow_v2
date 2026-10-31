import { webcrypto } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  VAPID_DEFAULT_TTL_SECONDS,
  VAPID_MAX_TTL_SECONDS,
  VapidError,
  buildVapidHeader,
  generateVapidKeys,
} from "../vapid";

const subtle = webcrypto.subtle;
const SUBJECT = "https://example.test/phone";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/TEST-ONLY-TOKEN";
const NOW = 1_790_000_000_123;
const keys = generateVapidKeys();

function parse(header: string): { h: string; p: string; s: string; k: string } {
  const m = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(header);
  if (!m) throw new Error("header has the wrong shape");
  return { h: m[1] ?? "", p: m[2] ?? "", s: m[3] ?? "", k: m[4] ?? "" };
}

async function verifies(publicKey: string, signingInput: string, signature: Uint8Array): Promise<boolean> {
  const key = await subtle.importKey(
    "raw",
    Buffer.from(publicKey, "base64url"),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, new TextEncoder().encode(signingInput));
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof VapidError ? error.code : "other:" + String(error);
  }
  return "no-throw";
}

const base = { endpoint: ENDPOINT, privateKey: keys.privateKey, publicKey: keys.publicKey, subject: SUBJECT, now: NOW };

describe("generateVapidKeys", () => {
  it("returns a 65-byte uncompressed public key and a 32-byte private key, base64url without padding", () => {
    const pub = Buffer.from(keys.publicKey, "base64url");
    const priv = Buffer.from(keys.privateKey, "base64url");
    expect(pub.length).toBe(65);
    expect(pub[0]).toBe(4);
    expect(priv.length).toBe(32);
    for (const text of [keys.publicKey, keys.privateKey]) {
      expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(text).not.toContain("=");
    }
    expect(generateVapidKeys().publicKey).not.toBe(keys.publicKey);
  });
});

describe("buildVapidHeader", () => {
  it("has the vapid t=<jwt>, k=<key> shape and carries the public key", () => {
    const parsed = parse(buildVapidHeader(base));
    expect(parsed.k).toBe(keys.publicKey);
  });

  it("signs an ES256 JWT that verifies with the public key", async () => {
    const { h, p, s } = parse(buildVapidHeader(base));
    expect(JSON.parse(Buffer.from(h, "base64url").toString("utf8"))).toEqual({ typ: "JWT", alg: "ES256" });
    const signature = Buffer.from(s, "base64url");
    expect(signature.length).toBe(64);
    expect(await verifies(keys.publicKey, h + "." + p, signature)).toBe(true);
    const forged = Buffer.from(JSON.stringify({ aud: "https://evil.example", exp: 1, sub: SUBJECT })).toString("base64url");
    expect(await verifies(keys.publicKey, h + "." + forged, signature)).toBe(false);
    const other = generateVapidKeys();
    expect(await verifies(other.publicKey, h + "." + p, signature)).toBe(false);
  });

  it("claims aud = endpoint origin, exp = now + 12 h, sub = the https subject", () => {
    const claims = JSON.parse(Buffer.from(parse(buildVapidHeader(base)).p, "base64url").toString("utf8"));
    expect(Object.keys(claims).sort()).toEqual(["aud", "exp", "sub"]);
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe(SUBJECT);
    expect(VAPID_DEFAULT_TTL_SECONDS).toBe(43200);
    expect(claims.exp).toBe(Math.floor(NOW / 1000) + 43200);
    expect(claims.exp - Math.floor(NOW / 1000)).toBeLessThanOrEqual(24 * 3600);
  });

  it.each([
    ["https://fcm.googleapis.com/fcm/send/abc", "https://fcm.googleapis.com"],
    ["https://updates.push.services.mozilla.com/wpush/v2/xyz?x=1", "https://updates.push.services.mozilla.com"],
    ["https://db5p.notify.windows.com:443/?token=x", "https://db5p.notify.windows.com"],
    ["https://web.push.apple.com/path/with/many/parts", "https://web.push.apple.com"],
  ])("takes the origin of %s", (endpoint, aud) => {
    const claims = JSON.parse(Buffer.from(parse(buildVapidHeader({ ...base, endpoint })).p, "base64url").toString("utf8"));
    expect(claims.aud).toBe(aud);
  });

  it("accepts a shorter lifetime and up to 24 h, and refuses anything longer or odd", () => {
    const exp = (ttlSeconds: number): number =>
      JSON.parse(Buffer.from(parse(buildVapidHeader({ ...base, ttlSeconds })).p, "base64url").toString("utf8")).exp;
    expect(exp(3600)).toBe(Math.floor(NOW / 1000) + 3600);
    expect(VAPID_MAX_TTL_SECONDS).toBe(86400);
    expect(exp(86400)).toBe(Math.floor(NOW / 1000) + 86400);
    for (const bad of [86401, 172800, 0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(codeOf(() => buildVapidHeader({ ...base, ttlSeconds: bad }))).toBe("bad_ttl");
    }
  });

  it("requires an https URL as subject, never an e-mail", () => {
    for (const subject of ["mailto:owner@example.test", "owner@example.test", "http://example.test/", "https://u:p@example.test/", "not a url", ""]) {
      expect(codeOf(() => buildVapidHeader({ ...base, subject }))).toBe("bad_subject");
    }
  });

  it("requires an https endpoint", () => {
    for (const endpoint of ["http://fcm.googleapis.com/x", "garbage", ""]) {
      expect(codeOf(() => buildVapidHeader({ ...base, endpoint }))).toBe("bad_endpoint");
    }
  });

  it("requires a valid time", () => {
    for (const now of [Number.NaN, -1, Number.POSITIVE_INFINITY, "now" as unknown as number]) {
      expect(codeOf(() => buildVapidHeader({ ...base, now }))).toBe("bad_now");
    }
  });

  it("refuses malformed or mismatched keys without echoing them", () => {
    const other = generateVapidKeys();
    expect(codeOf(() => buildVapidHeader({ ...base, privateKey: other.privateKey }))).toBe("bad_key");
    expect(codeOf(() => buildVapidHeader({ ...base, privateKey: keys.privateKey + "=" }))).toBe("bad_key");
    expect(codeOf(() => buildVapidHeader({ ...base, privateKey: keys.privateKey.slice(0, 20) }))).toBe("bad_key");
    expect(codeOf(() => buildVapidHeader({ ...base, publicKey: keys.publicKey.slice(0, 40) }))).toBe("bad_key");
    try {
      buildVapidHeader({ ...base, privateKey: other.privateKey });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(other.privateKey);
      expect(String((error as Error).message)).not.toContain(keys.privateKey);
    }
  });
});
