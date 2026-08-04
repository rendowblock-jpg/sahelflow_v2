import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import {
  ProtectedDataCorruptionError,
  type ProtectedDataFailure,
} from "@/lib/crypto/protected-data-error";

const FORMAT = "sahelflow-protected-value" as const;
const VERSION = 1 as const;
const ALGORITHM = "aes-256-gcm" as const;
const KEY_DESCRIPTOR_FORMAT_VERSION = 1 as const;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD_DOMAIN = Buffer.from("sahelflow.protected-value.aad.v1\0", "utf8");
const BINDING_DOMAIN = Buffer.from(
  "sahelflow.protected-value.binding.v1\0",
  "utf8",
);
const KEY_ID_DOMAIN = Buffer.from(
  "sahelflow.protected-value.key-id.v1\0",
  "utf8",
);

export const PROTECTED_VALUE_PURPOSES = [
  "shop-data",
  "shop-blind-index",
  "shop-secret",
  "business-payload",
  "key-wrap",
  "backup-manifest",
  "recovery-kit",
] as const;

export type ProtectedValuePurpose =
  (typeof PROTECTED_VALUE_PURPOSES)[number];

export type ShopProtectedKeyPurpose =
  | "shop-data"
  | "shop-blind-index"
  | "shop-secret";

export interface ProtectedValueKeyDescriptor {
  formatVersion: typeof KEY_DESCRIPTOR_FORMAT_VERSION;
  purpose: ProtectedValuePurpose;
  version: number;
  keyId: string;
}

/** Exact shop-record context authenticated as AEAD associated data. */
export interface ShopRecordProtectedValueBinding {
  scope: "shop-record";
  workspaceId: string;
  shopId: string;
  shopIncarnationId: string;
  recordType: string;
  recordId: string;
  field: string;
}

/**
 * Context for a wrapped random shop key. Installation ID is authenticated so a
 * replacement install must explicitly unwrap with recovery authority and
 * re-wrap under the new local installation root.
 */
export interface ShopKeyAuthorityBinding {
  scope: "shop-key-authority";
  workspaceId: string;
  installationId: string;
  shopId: string;
  shopIncarnationId: string;
  protectedPurpose: ShopProtectedKeyPurpose;
  protectedVersion: number;
}

export type ProtectedValueBinding =
  | ShopRecordProtectedValueBinding
  | ShopKeyAuthorityBinding;

interface ProtectedValueEnvelope {
  format: typeof FORMAT;
  version: typeof VERSION;
  algorithm: typeof ALGORITHM;
  key: ProtectedValueKeyDescriptor;
  bindingSha256: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

function fail(
  failure: ProtectedDataFailure,
  message: string,
  cause?: unknown,
): never {
  throw new ProtectedDataCorruptionError(failure, message, cause);
}

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new TypeError("Protected value key must be a 256-bit key");
  }
}

function assertPurpose(purpose: ProtectedValuePurpose): void {
  if (!PROTECTED_VALUE_PURPOSES.includes(purpose)) {
    throw new TypeError("Protected value key purpose is unsupported");
  }
}

function assertVersion(version: number, label = "Protected value key version"): void {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function assertIdentifier(
  value: string,
  label: string,
  maximum: number,
): void {
  if (
    !value ||
    value !== value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function assertHexIdentity(value: string, label: string): void {
  if (!/^[0-9a-f]{32}$/i.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
}

function assertBinding(binding: ProtectedValueBinding): void {
  assertHexIdentity(binding.workspaceId, "Workspace ID");
  assertIdentifier(binding.shopId, "Shop ID", 64);
  assertHexIdentity(binding.shopIncarnationId, "Shop incarnation ID");

  if (binding.scope === "shop-record") {
    assertIdentifier(binding.recordType, "Record type", 128);
    assertIdentifier(binding.recordId, "Record ID", 256);
    assertIdentifier(binding.field, "Field", 128);
    return;
  }

  if (binding.scope === "shop-key-authority") {
    assertHexIdentity(binding.installationId, "Installation ID");
    if (
      binding.protectedPurpose !== "shop-data" &&
      binding.protectedPurpose !== "shop-blind-index" &&
      binding.protectedPurpose !== "shop-secret"
    ) {
      throw new TypeError("Protected key purpose is unsupported");
    }
    assertVersion(binding.protectedVersion, "Protected key version");
    return;
  }

  const exhaustive: never = binding;
  throw new TypeError(`Protected value scope is unsupported: ${String(exhaustive)}`);
}

function bindingBytes(binding: ProtectedValueBinding): Buffer {
  assertBinding(binding);
  if (binding.scope === "shop-record") {
    return Buffer.from(
      JSON.stringify({
        scope: binding.scope,
        workspaceId: binding.workspaceId.toLowerCase(),
        shopId: binding.shopId,
        shopIncarnationId: binding.shopIncarnationId.toLowerCase(),
        recordType: binding.recordType,
        recordId: binding.recordId,
        field: binding.field,
      }),
      "utf8",
    );
  }
  return Buffer.from(
    JSON.stringify({
      scope: binding.scope,
      workspaceId: binding.workspaceId.toLowerCase(),
      installationId: binding.installationId.toLowerCase(),
      shopId: binding.shopId,
      shopIncarnationId: binding.shopIncarnationId.toLowerCase(),
      protectedPurpose: binding.protectedPurpose,
      protectedVersion: binding.protectedVersion,
    }),
    "utf8",
  );
}

function bindingDigest(binding: ProtectedValueBinding): string {
  return createHash("sha256")
    .update(BINDING_DOMAIN)
    .update(bindingBytes(binding))
    .digest("hex");
}

function keyId(
  key: Buffer,
  purpose: ProtectedValuePurpose,
  version: number,
): string {
  assertKey(key);
  assertPurpose(purpose);
  assertVersion(version);
  return createHash("sha256")
    .update(KEY_ID_DOMAIN)
    .update(purpose, "utf8")
    .update("\0", "utf8")
    .update(String(version), "utf8")
    .update("\0", "utf8")
    .update(key)
    .digest("hex");
}

export function createProtectedValueKeyDescriptor(
  key: Buffer,
  purpose: ProtectedValuePurpose,
  version: number,
): ProtectedValueKeyDescriptor {
  return {
    formatVersion: KEY_DESCRIPTOR_FORMAT_VERSION,
    purpose,
    version,
    keyId: keyId(key, purpose, version),
  };
}

function descriptorMatches(
  left: ProtectedValueKeyDescriptor,
  right: ProtectedValueKeyDescriptor,
): boolean {
  return (
    left.formatVersion === right.formatVersion &&
    left.purpose === right.purpose &&
    left.version === right.version &&
    left.keyId === right.keyId
  );
}

function assertDescriptorForKey(
  key: Buffer,
  descriptor: ProtectedValueKeyDescriptor,
): void {
  if (
    descriptor.formatVersion !== KEY_DESCRIPTOR_FORMAT_VERSION ||
    !PROTECTED_VALUE_PURPOSES.includes(descriptor.purpose) ||
    !Number.isSafeInteger(descriptor.version) ||
    descriptor.version < 1 ||
    !/^[0-9a-f]{64}$/.test(descriptor.keyId)
  ) {
    throw new TypeError("Protected value key descriptor is invalid");
  }
  if (
    descriptor.keyId !==
    keyId(key, descriptor.purpose, descriptor.version)
  ) {
    fail(
      "key",
      "Protected value key descriptor does not match the supplied key",
    );
  }
}

function metadataBytes(
  envelope: Pick<
    ProtectedValueEnvelope,
    "format" | "version" | "algorithm" | "key" | "bindingSha256"
  >,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      format: envelope.format,
      version: envelope.version,
      algorithm: envelope.algorithm,
      key: {
        formatVersion: envelope.key.formatVersion,
        purpose: envelope.key.purpose,
        version: envelope.key.version,
        keyId: envelope.key.keyId,
      },
      bindingSha256: envelope.bindingSha256,
    }),
    "utf8",
  );
}

function aadBytes(
  envelope: Pick<
    ProtectedValueEnvelope,
    "format" | "version" | "algorithm" | "key" | "bindingSha256"
  >,
  binding: ProtectedValueBinding,
): Buffer {
  return Buffer.concat([
    AAD_DOMAIN,
    metadataBytes(envelope),
    Buffer.from([0]),
    bindingBytes(binding),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((entry, index) => entry === sortedExpected[index])
  );
}

function decodeBase64(
  value: string,
  label: string,
  expectedLength?: number,
): Buffer {
  if (
    value !== "" &&
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    fail("format", `${label} is not canonical base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value ||
    (expectedLength !== undefined && decoded.length !== expectedLength)
  ) {
    fail("format", `${label} has invalid dimensions`);
  }
  return decoded;
}

function parseEnvelope(value: string): ProtectedValueEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    fail("format", "Protected value envelope is malformed", cause);
  }

  if (
    !isRecord(parsed) ||
    !exactKeys(parsed, [
      "format",
      "version",
      "algorithm",
      "key",
      "bindingSha256",
      "iv",
      "ciphertext",
      "tag",
    ])
  ) {
    fail("format", "Protected value envelope has unsupported fields");
  }

  const key = parsed.key;
  if (
    !isRecord(key) ||
    !exactKeys(key, ["formatVersion", "purpose", "version", "keyId"])
  ) {
    fail("format", "Protected value key descriptor is malformed");
  }

  if (
    parsed.format !== FORMAT ||
    parsed.version !== VERSION ||
    parsed.algorithm !== ALGORITHM ||
    key.formatVersion !== KEY_DESCRIPTOR_FORMAT_VERSION ||
    typeof key.purpose !== "string" ||
    !PROTECTED_VALUE_PURPOSES.includes(key.purpose as ProtectedValuePurpose) ||
    typeof key.version !== "number" ||
    !Number.isSafeInteger(key.version) ||
    key.version < 1 ||
    typeof key.keyId !== "string" ||
    !/^[0-9a-f]{64}$/.test(key.keyId) ||
    typeof parsed.bindingSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(parsed.bindingSha256) ||
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.tag !== "string"
  ) {
    fail("format", "Protected value envelope is unsupported or malformed");
  }

  decodeBase64(parsed.iv, "Protected value IV", IV_BYTES);
  decodeBase64(parsed.ciphertext, "Protected value ciphertext");
  decodeBase64(parsed.tag, "Protected value tag", TAG_BYTES);
  return parsed as unknown as ProtectedValueEnvelope;
}

export function isProtectedValueEnvelope(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  try {
    parseEnvelope(value);
    return true;
  } catch {
    return false;
  }
}

export function sealProtectedString(
  plaintext: string,
  key: Buffer,
  descriptor: ProtectedValueKeyDescriptor,
  binding: ProtectedValueBinding,
): string {
  assertDescriptorForKey(key, descriptor);
  const iv = randomBytes(IV_BYTES);
  const metadata = {
    format: FORMAT,
    version: VERSION,
    algorithm: ALGORITHM,
    key: descriptor,
    bindingSha256: bindingDigest(binding),
  } as const;
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aadBytes(metadata, binding));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const envelope: ProtectedValueEnvelope = {
    ...metadata,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
  return JSON.stringify(envelope);
}

export function openProtectedString(
  encoded: string,
  key: Buffer,
  descriptor: ProtectedValueKeyDescriptor,
  binding: ProtectedValueBinding,
): string {
  assertDescriptorForKey(key, descriptor);
  const envelope = parseEnvelope(encoded);
  if (!descriptorMatches(envelope.key, descriptor)) {
    fail("key", "Protected value belongs to another key or purpose");
  }
  if (envelope.bindingSha256 !== bindingDigest(binding)) {
    fail("context", "Protected value belongs to another record context");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      decodeBase64(envelope.iv, "Protected value IV", IV_BYTES),
    );
    decipher.setAAD(aadBytes(envelope, binding));
    decipher.setAuthTag(
      decodeBase64(envelope.tag, "Protected value tag", TAG_BYTES),
    );
    return Buffer.concat([
      decipher.update(
        decodeBase64(envelope.ciphertext, "Protected value ciphertext"),
      ),
      decipher.final(),
    ]).toString("utf8");
  } catch (cause) {
    if (cause instanceof ProtectedDataCorruptionError) throw cause;
    fail("authentication", "Protected value failed authentication", cause);
  }
}
