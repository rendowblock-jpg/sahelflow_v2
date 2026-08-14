import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
  canonicalEntitlementBytes,
} from "../../src/lib/license/entitlement-canonical";
import type { SignedEntitlement } from "../../src/lib/license/entitlement";
import type { BackupWorkerEnvironment } from "./types";

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const HEX_ID = /^[0-9a-f]{32}$/i;
const DEVICE_BINDING = /^sfdb1_[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function arrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return copy;
}

export function base64Bytes(value: string): Uint8Array {
  if (!BASE64.test(value)) throw new Error("invalid base64");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", arrayBuffer(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexBytes(value: string): ArrayBuffer {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("invalid sha256");
  const bytes = Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  return arrayBuffer(bytes);
}

export function arrayBufferHex(value: ArrayBuffer | undefined): string | null {
  if (!value) return null;
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parsedKeyring(value: string): Record<string, string> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("keyring must be an object");
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (!OPAQUE_ID.test(key) || typeof item !== "string") throw new Error("invalid keyring");
    result[key] = item;
  }
  return result;
}

export async function verifyEd25519(
  publicKeyBase64: string,
  signatureBase64: string,
  message: Uint8Array,
): Promise<boolean> {
  const raw = base64Bytes(publicKeyBase64);
  if (raw.byteLength !== 32) throw new Error("Ed25519 public key must be 32 bytes");
  const key = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(raw),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    arrayBuffer(base64Bytes(signatureBase64)),
    arrayBuffer(message),
  );
}

export async function verifyEntitlement(
  input: unknown,
  environment: BackupWorkerEnvironment,
): Promise<SignedEntitlement> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid entitlement");
  const entitlement = input as SignedEntitlement;
  const claims = entitlement.claims;
  if (
    !claims ||
    claims.domain !== LICENSE_ENTITLEMENT_DOMAIN ||
    claims.formatVersion !== LICENSE_ENTITLEMENT_FORMAT ||
    !HEX_ID.test(claims.workspaceId) ||
    !HEX_ID.test(claims.installationId) ||
    !DEVICE_BINDING.test(claims.deviceBinding) ||
    !OPAQUE_ID.test(claims.licenseId) ||
    !OPAQUE_ID.test(claims.keyId) ||
    typeof entitlement.signature !== "string" ||
    !BASE64.test(entitlement.signature) ||
    claims.transferState !== "active" ||
    !Number.isSafeInteger(claims.revocationEpoch) ||
    claims.revocationEpoch < 0 ||
    !Number.isSafeInteger(claims.shopSlots) ||
    claims.shopSlots < 1 ||
    !Number.isSafeInteger(claims.memberLimit) ||
    claims.memberLimit < 1 ||
    !Number.isSafeInteger(claims.deviceLimit) ||
    claims.deviceLimit < 1 ||
    !Number.isSafeInteger(claims.backupBytes) ||
    claims.backupBytes < 0 ||
    !Array.isArray(claims.features) ||
    claims.features.length < 1 ||
    !claims.features.every((feature) => typeof feature === "string")
  ) throw new Error("invalid entitlement claims");

  const productMajor = Number(environment.PRODUCT_MAJOR);
  if (!Number.isSafeInteger(productMajor) || productMajor < 1 || claims.productMajor !== productMajor) {
    throw new Error("product major mismatch");
  }
  if (claims.expiresAt && Date.parse(claims.expiresAt) <= Date.now()) throw new Error("entitlement expired");
  const ring = claims.issuer === "founder-offline"
    ? parsedKeyring(environment.SF_LICENSE_PERMANENT_PUBLIC_KEYS)
    : parsedKeyring(environment.SF_LICENSE_TRIAL_PUBLIC_KEYS);
  const publicKey = ring[claims.keyId];
  if (!publicKey) throw new Error("entitlement key unavailable");
  if (!(await verifyEd25519(publicKey, entitlement.signature, canonicalEntitlementBytes(claims)))) {
    throw new Error("entitlement signature invalid");
  }
  return entitlement;
}
