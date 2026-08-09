import http from "node:http";
import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";

const KEY_ID = "ci-trial-key-v1";
const DEFAULT_TEST_KEY_HEX =
  "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
const EXPECTED_TEST_PUBLIC_KEY = "ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=";
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const exactAuthorityId = /^[0-9a-f]{32}$/i;
const exactDeviceBinding = /^sfdb1_[0-9a-f]{64}$/;

function seedFromHex(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("CI trial signing seed must be exactly 32 bytes of hex");
  }
  return Buffer.from(value, "hex");
}

function privateKeyFromSeed(seed) {
  return createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

function rawPublicKey(privateKey) {
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  if (
    spki.length !== SPKI_ED25519_PREFIX.length + 32 ||
    !spki.subarray(0, SPKI_ED25519_PREFIX.length).equals(SPKI_ED25519_PREFIX)
  ) {
    throw new Error("CI trial signer returned an unexpected Ed25519 SPKI encoding");
  }
  return spki.subarray(SPKI_ED25519_PREFIX.length);
}

function canonicalBytes(claims) {
  const canonical = [
    claims.domain,
    claims.formatVersion,
    claims.licenseId,
    claims.workspaceId,
    claims.installationId,
    claims.deviceBinding,
    claims.productMajor,
    claims.type,
    claims.issuedAt,
    claims.expiresAt,
    claims.supportEndsAt,
    claims.shopSlots,
    claims.memberLimit,
    claims.deviceLimit,
    claims.backupBytes,
    claims.mediaBytes,
    [...claims.features].sort(),
    claims.transferState,
    claims.transferEpoch,
    claims.recoveryEpoch,
    claims.revocationEpoch,
    claims.keyId,
    claims.issuer,
  ];
  return Buffer.from(JSON.stringify(canonical), "utf8");
}

function validateTrialRequest(request) {
  if (!request || typeof request !== "object") {
    throw new Error("CI trial request must be a JSON object");
  }
  if (!exactAuthorityId.test(request.workspaceId ?? "")) {
    throw new Error("CI trial request workspaceId is invalid");
  }
  if (!exactAuthorityId.test(request.installationId ?? "")) {
    throw new Error("CI trial request installationId is invalid");
  }
  if (!exactDeviceBinding.test(request.deviceBinding ?? "")) {
    throw new Error("CI trial request deviceBinding is invalid");
  }
  if (typeof request.appVersion !== "string" || !/^1\./.test(request.appVersion)) {
    throw new Error("CI trial request appVersion is invalid");
  }
}

function issueTrial(request, privateKey, now = new Date()) {
  validateTrialRequest(request);
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const support = new Date(now.getTime() + 5 * 365 * 24 * 60 * 60 * 1000);
  const claims = {
    domain: "sahelflow.license.entitlement.v2",
    formatVersion: 2,
    licenseId: "ci-phase4-trial-0001",
    workspaceId: request.workspaceId,
    installationId: request.installationId,
    deviceBinding: request.deviceBinding,
    productMajor: 1,
    type: "trial",
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    supportEndsAt: support.toISOString(),
    shopSlots: 10,
    memberLimit: 10,
    deviceLimit: 10,
    backupBytes: 50 * 1024 * 1024 * 1024,
    mediaBytes: 10 * 1024 * 1024 * 1024,
    features: ["core"],
    transferState: "active",
    transferEpoch: 0,
    recoveryEpoch: 0,
    revocationEpoch: 0,
    keyId: KEY_ID,
    issuer: "trial-service",
  };
  const signature = sign(null, canonicalBytes(claims), privateKey).toString("base64");
  return { claims, signature };
}

function publicKeyBase64(seedHex) {
  const seed = seedFromHex(seedHex);
  try {
    return rawPublicKey(privateKeyFromSeed(seed)).toString("base64");
  } finally {
    seed.fill(0);
  }
}

function runSelfTest(seedHex) {
  const seed = seedFromHex(seedHex);
  try {
    const privateKey = privateKeyFromSeed(seed);
    const publicKey = createPublicKey(privateKey);
    const raw = rawPublicKey(privateKey).toString("base64");
    if (seedHex === DEFAULT_TEST_KEY_HEX && raw !== EXPECTED_TEST_PUBLIC_KEY) {
      throw new Error(`CI trial public key drifted: ${raw}`);
    }
    const entitlement = issueTrial(
      {
        workspaceId: "0123456789abcdef0123456789abcdef",
        installationId: "fedcba9876543210fedcba9876543210",
        deviceBinding: `sfdb1_${"a".repeat(64)}`,
        appVersion: "1.0.0-internal.14",
      },
      privateKey,
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const valid = verify(
      null,
      canonicalBytes(entitlement.claims),
      publicKey,
      Buffer.from(entitlement.signature, "base64"),
    );
    if (!valid) throw new Error("CI trial self-test signature did not verify");
    console.log(JSON.stringify({ ok: true, keyId: KEY_ID, publicKey: raw }));
  } finally {
    seed.fill(0);
  }
}

function startServer(portText, seedHex) {
  const port = Number.parseInt(portText, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("CI trial issuer port is invalid");
  }
  const seed = seedFromHex(seedHex);
  const privateKey = privateKeyFromSeed(seed);
  seed.fill(0);

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end('{"ok":true}');
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/trials") {
      res.writeHead(404).end();
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const entitlement = issueTrial(request, privateKey);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(entitlement));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`CI trial issuance failed: ${detail}`);
      res.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "ci_trial_failure", detail }));
    }
  });
  server.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1");
}

const [mode, first, second] = process.argv.slice(2);
if (mode === "--self-test") {
  runSelfTest(first ?? DEFAULT_TEST_KEY_HEX);
} else if (mode === "--public-key") {
  console.log(publicKeyBase64(first ?? DEFAULT_TEST_KEY_HEX));
} else if (mode === "--serve") {
  startServer(first, second);
} else {
  throw new Error("Usage: phase4-ci-trial-issuer.mjs --self-test [seedHex] | --public-key [seedHex] | --serve <port> <seedHex>");
}
