#!/usr/bin/env bun

import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

interface TauriConfiguration {
  plugins?: {
    updater?: {
      pubkey?: string;
    };
  };
}

interface VersionAuthority {
  updater?: {
    publicKeyId?: string;
    signingKeyId?: string | null;
  };
}

function fail(message: string): never {
  console.error(`Updater artifact verification failed: ${message}`);
  process.exit(1);
}

function decodeBase64Strict(value: string, label: string): Uint8Array {
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.length % 4 === 1) {
    fail(`${label} is not valid base64`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    fail(`${label} is not valid base64`);
  }

  const decoded = Buffer.from(compact, "base64");
  const canonical = decoded.toString("base64").replace(/=+$/u, "");
  if (canonical !== compact.replace(/=+$/u, "")) {
    fail(`${label} is not canonical base64`);
  }
  return decoded;
}

function payloadLine(box: string, label: string): string {
  const line = box
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(
      (entry) =>
        entry.length > 0 &&
        !entry.toLowerCase().startsWith("untrusted comment:") &&
        !entry.toLowerCase().startsWith("trusted comment:"),
    );
  if (!line) fail(`${label} has no encoded payload line`);
  return line;
}

/**
 * Tauri accepts and emits minisign material in two equivalent forms:
 *
 * 1. a plain minisign text box (`untrusted comment`, payload, trusted comment), or
 * 2. one outer base64 string whose decoded bytes are that minisign text box.
 *
 * Older fixtures may also contain only the raw base64 payload line. Decode all
 * three forms, but require the exact expected minisign payload length so an
 * arbitrary outer envelope can never be mistaken for a signature payload.
 */
function decodeMinisignPayload(
  box: string,
  expectedLabel: string,
  expectedLength: number,
): Uint8Array {
  const trimmed = box.trim();
  if (!trimmed) fail(`${expectedLabel} is empty`);

  if (/^(?:untrusted|trusted) comment:/imu.test(trimmed) || /\r?\n/u.test(trimmed)) {
    return decodeBase64Strict(
      payloadLine(trimmed, expectedLabel),
      `${expectedLabel} payload`,
    );
  }

  const firstLayer = decodeBase64Strict(trimmed, expectedLabel);
  if (firstLayer.length === expectedLength) {
    return firstLayer;
  }

  const decodedBox = Buffer.from(firstLayer).toString("utf8");
  if (!/(?:untrusted|trusted) comment:/iu.test(decodedBox)) {
    fail(
      `${expectedLabel} decoded to ${firstLayer.length} bytes instead of a ${expectedLength}-byte payload or minisign text box`,
    );
  }

  return decodeBase64Strict(
    payloadLine(decodedBox, expectedLabel),
    `${expectedLabel} payload`,
  );
}

function keyIdFromRawBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).reverse().toString("hex").toUpperCase();
}

function signatureTextBox(box: string): string {
  const trimmed = box.trim();
  if (/^untrusted comment:/imu.test(trimmed)) return trimmed;

  const decoded = Buffer.from(
    decodeBase64Strict(trimmed, "signature file"),
  ).toString("utf8");
  if (!/^untrusted comment:/imu.test(decoded)) {
    fail("signature file must contain a complete minisign text box");
  }
  return decoded.trim();
}

function parseSignatureBox(box: string): {
  payload: Uint8Array;
  trustedComment: string;
  globalSignature: Uint8Array;
} {
  const lines = signatureTextBox(box).split(/\r?\n/u);
  if (lines.length !== 4 || !lines[0]?.startsWith("untrusted comment:")) {
    fail("signature file must contain exactly one complete minisign signature");
  }
  const trustedPrefix = "trusted comment: ";
  if (!lines[2]?.startsWith(trustedPrefix)) {
    fail("signature file trusted comment is missing");
  }
  return {
    payload: decodeBase64Strict(lines[1] ?? "", "signature file payload"),
    trustedComment: lines[2].slice(trustedPrefix.length),
    globalSignature: decodeBase64Strict(
      lines[3] ?? "",
      "signature file global signature",
    ),
  };
}

const [artifactArg, signatureArg] = process.argv.slice(2);
if (!artifactArg || !signatureArg) {
  fail("usage: verify-updater-artifact.ts <artifact.msi> <artifact.msi.sig>");
}

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const artifactPath = resolve(root, artifactArg);
const signaturePath = resolve(root, signatureArg);
const tauri = JSON.parse(
  readFileSync(resolve(root, "src-tauri", "tauri.conf.json"), "utf8"),
) as TauriConfiguration;
const authority = JSON.parse(
  readFileSync(resolve(root, "sahelflow.version.json"), "utf8"),
) as VersionAuthority;

const publicKeyBox = tauri.plugins?.updater?.pubkey?.trim();
const expectedPublicKeyId = authority.updater?.publicKeyId;
const signingKeyId = authority.updater?.signingKeyId;
if (!publicKeyBox) fail("Tauri updater public key is missing");
if (!expectedPublicKeyId) fail("version authority publicKeyId is missing");
if (!signingKeyId) fail("version authority signingKeyId is missing");

const publicKeyPayload = decodeMinisignPayload(publicKeyBox, "public key", 42);
if (publicKeyPayload.length !== 42) {
  fail(`public key payload must contain 42 bytes, found ${publicKeyPayload.length}`);
}
if (Buffer.from(publicKeyPayload.subarray(0, 2)).toString("ascii") !== "Ed") {
  fail("public key algorithm marker is not Ed25519");
}
const publicKeyNumber = publicKeyPayload.subarray(2, 10);
const observedPublicKeyId = keyIdFromRawBytes(publicKeyNumber);
if (observedPublicKeyId !== expectedPublicKeyId) {
  fail(
    `compiled public key ID ${observedPublicKeyId} does not match authority ${expectedPublicKeyId}`,
  );
}
if (!signingKeyId.toLowerCase().endsWith(expectedPublicKeyId.toLowerCase())) {
  fail("signingKeyId is not visibly bound to the accepted public key ID");
}

const signatureBox = readFileSync(signaturePath, "utf8").trim();
const parsedSignature = parseSignatureBox(signatureBox);
const signaturePayload = parsedSignature.payload;
if (signaturePayload.length !== 74) {
  fail(`signature payload must contain 74 bytes, found ${signaturePayload.length}`);
}
const algorithm = Buffer.from(signaturePayload.subarray(0, 2)).toString("ascii");
if (algorithm !== "Ed" && algorithm !== "ED") {
  fail(`signature algorithm marker ${JSON.stringify(algorithm)} is unsupported`);
}
const signatureKeyNumber = signaturePayload.subarray(2, 10);
if (!Buffer.from(signatureKeyNumber).equals(Buffer.from(publicKeyNumber))) {
  fail(
    `signature key ID ${keyIdFromRawBytes(signatureKeyNumber)} does not match compiled public key ${observedPublicKeyId}`,
  );
}
const signatureBytes = signaturePayload.subarray(10);
if (parsedSignature.globalSignature.length !== 64) {
  fail(
    `signature global payload must contain 64 bytes, found ${parsedSignature.globalSignature.length}`,
  );
}

const artifact = readFileSync(artifactPath);
const artifactSize = statSync(artifactPath).size;
if (artifactSize < 1) fail("MSI artifact is empty");
const rawPublicKey = publicKeyPayload.subarray(10);
const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
const verifierKey = createPublicKey({
  key: Buffer.concat([spkiPrefix, rawPublicKey]),
  format: "der",
  type: "spki",
});
const signedArtifact =
  algorithm === "ED"
    ? createHash("blake2b512").update(artifact).digest()
    : artifact;
if (!verify(null, signedArtifact, verifierKey, signatureBytes)) {
  fail("MSI signature does not verify against the compiled public key");
}
const globalPayload = Buffer.concat([
  signatureBytes,
  Buffer.from(parsedSignature.trustedComment, "utf8"),
]);
if (
  !verify(
    null,
    globalPayload,
    verifierKey,
    parsedSignature.globalSignature,
  )
) {
  fail("signature trusted comment does not verify against the compiled public key");
}
const artifactSha256 = createHash("sha256")
  .update(artifact)
  .digest("hex");
const signatureSha256 = createHash("sha256")
  .update(readFileSync(signaturePath))
  .digest("hex");

console.log(
  `Updater artifact key binding verified: key ${observedPublicKeyId}; MSI ${artifactSize} bytes; sha256 ${artifactSha256}; signature sha256 ${signatureSha256}`,
);
