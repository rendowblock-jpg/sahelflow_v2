#!/usr/bin/env bun

import { createHash } from "node:crypto";
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

function decodePayload(box: string, expectedLabel: string): Uint8Array {
  const decodedBox = Buffer.from(box.trim(), "base64").toString("utf8");
  const payloadLine = decodedBox
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.toLowerCase().startsWith("untrusted comment:"));
  if (!payloadLine) fail(`${expectedLabel} has no encoded payload line`);
  try {
    return Buffer.from(payloadLine, "base64");
  } catch {
    fail(`${expectedLabel} payload is not valid base64`);
  }
}

function decodeSignature(signatureBox: string): Uint8Array {
  const payloadLine = signatureBox
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.toLowerCase().startsWith("untrusted comment:"));
  if (!payloadLine) fail("signature file has no encoded signature payload");
  try {
    return Buffer.from(payloadLine, "base64");
  } catch {
    fail("signature payload is not valid base64");
  }
}

function keyIdFromRawBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).reverse().toString("hex").toUpperCase();
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

const publicKeyPayload = decodePayload(publicKeyBox, "public key");
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
const signaturePayload = decodeSignature(signatureBox);
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
if (signatureBytes.every((byte) => byte === 0)) {
  fail("signature bytes are empty");
}

const artifactSize = statSync(artifactPath).size;
if (artifactSize < 1) fail("MSI artifact is empty");
const artifactSha256 = createHash("sha256")
  .update(readFileSync(artifactPath))
  .digest("hex");
const signatureSha256 = createHash("sha256")
  .update(readFileSync(signaturePath))
  .digest("hex");

console.log(
  `Updater artifact key binding verified: key ${observedPublicKeyId}; MSI ${artifactSize} bytes; sha256 ${artifactSha256}; signature sha256 ${signatureSha256}`,
);
