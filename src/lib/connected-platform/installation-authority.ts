import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { deriveInstallationKey } from "@/lib/crypto/key-hierarchy";
import { getMasterKey } from "@/lib/crypto/master-key";
import type { ServiceContext } from "@/lib/data/service-base";
import { getSecret } from "@/lib/secrets";
import { dataRoot } from "@/lib/storage/data-root";
import { generateConnectedKeyPair } from "./payload-crypto";

export const LEGACY_CONNECTED_CONTROL_TOKEN_SECRET = "connected_control_token";
export const LEGACY_CONNECTED_BACKUP_TOKEN_SECRET = "connected_backup_token";
export const LEGACY_CONNECTED_DESKTOP_KEYS_SECRET = "connected_desktop_keys_v1";

const LEGACY_FORMAT_VERSION = 1 as const;
const FORMAT_VERSION = 2 as const;
const ALGORITHM = "aes-256-gcm" as const;
const KEY_VERSION = 1 as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_AUTHORITY_FILE_CHARS = 128 * 1024;
const FILE_NAME = "connected-installation-authority-v2.json";
const LEGACY_FILE_NAME = "connected-installation-authority-v1.json";
const LOCK_NAME = "connected-installation-authority-v2.lock";
const LEGACY_HMAC_DOMAIN = "sahelflow:connected-installation-authority:v1";
const HEX32 = /^[0-9a-f]{32}$/i;
const HEX64 = /^[0-9a-f]{64}$/;

type ConnectedDesktopKeys = Readonly<{
  signingPublicKey: string;
  signingPrivateKeyPkcs8: string;
  encryptionPublicKeyJwk: string;
  encryptionPrivateKeyPkcs8: string;
}>;

export type ConnectedInstallationAuthority = Readonly<{
  workspaceId: string;
  installationId: string;
  desktopKeys: ConnectedDesktopKeys;
  controlToken: string | null;
  backupToken: string | null;
  revision: number;
}>;

type AuthorityValue = {
  workspaceId: string;
  installationId: string;
  desktopKeys: ConnectedDesktopKeys;
  controlToken: string | null;
  backupToken: string | null;
  revision: number;
  updatedAt: string;
};

type StoredAuthorityV1 = AuthorityValue & {
  formatVersion: typeof LEGACY_FORMAT_VERSION;
  hmac: string;
};

type StoredAuthorityV2 = {
  formatVersion: typeof FORMAT_VERSION;
  algorithm: typeof ALGORITHM;
  keyVersion: typeof KEY_VERSION;
  keyId: string;
  workspaceId: string;
  installationId: string;
  revision: number;
  updatedAt: string;
  iv: string;
  ciphertext: string;
  tag: string;
};

type ReadAuthority = Readonly<{
  value: AuthorityValue;
  legacy: boolean;
}>;

export type ConnectedInstallationAuthorityRotationState =
  | "missing"
  | "would-rotate"
  | "rotated"
  | "already-current";

function authorityPath(): string {
  return join(dataRoot(), "system", FILE_NAME);
}

function legacyAuthorityPath(): string {
  return join(dataRoot(), "system", LEGACY_FILE_NAME);
}

function lockPath(): string {
  return join(dataRoot(), "system", LOCK_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return (
    actual.length === canonical.length &&
    actual.every((entry, index) => entry === canonical[index])
  );
}

function validKey(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseDesktopKeys(value: unknown): ConnectedDesktopKeys | null {
  if (!isRecord(value)) return null;
  if (
    !exactKeys(value, [
      "signingPublicKey",
      "signingPrivateKeyPkcs8",
      "encryptionPublicKeyJwk",
      "encryptionPrivateKeyPkcs8",
    ]) ||
    !validKey(value.signingPublicKey, 32, 512) ||
    !validKey(value.signingPrivateKeyPkcs8, 32, 16_384) ||
    !validKey(value.encryptionPublicKeyJwk, 32, 4_096) ||
    !validKey(value.encryptionPrivateKeyPkcs8, 32, 16_384)
  ) {
    return null;
  }
  return Object.freeze({
    signingPublicKey: value.signingPublicKey,
    signingPrivateKeyPkcs8: value.signingPrivateKeyPkcs8,
    encryptionPublicKeyJwk: value.encryptionPublicKeyJwk,
    encryptionPrivateKeyPkcs8: value.encryptionPrivateKeyPkcs8,
  });
}

function parseSensitivePayload(value: unknown): Pick<
  AuthorityValue,
  "desktopKeys" | "controlToken" | "backupToken"
> {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["desktopKeys", "controlToken", "backupToken"])
  ) {
    throw new Error("Connected installation authority protected payload is invalid");
  }
  const desktopKeys = parseDesktopKeys(value.desktopKeys);
  if (
    !desktopKeys ||
    !(value.controlToken === null || validKey(value.controlToken, 32, 256)) ||
    !(value.backupToken === null || validKey(value.backupToken, 32, 256))
  ) {
    throw new Error("Connected installation authority protected payload is invalid");
  }
  return {
    desktopKeys,
    controlToken: value.controlToken as string | null,
    backupToken: value.backupToken as string | null,
  };
}

function legacyCanonicalPayload(value: Omit<StoredAuthorityV1, "hmac">): string {
  return JSON.stringify({
    formatVersion: value.formatVersion,
    workspaceId: value.workspaceId,
    installationId: value.installationId,
    desktopKeys: {
      signingPublicKey: value.desktopKeys.signingPublicKey,
      signingPrivateKeyPkcs8: value.desktopKeys.signingPrivateKeyPkcs8,
      encryptionPublicKeyJwk: value.desktopKeys.encryptionPublicKeyJwk,
      encryptionPrivateKeyPkcs8: value.desktopKeys.encryptionPrivateKeyPkcs8,
    },
    controlToken: value.controlToken,
    backupToken: value.backupToken,
    revision: value.revision,
    updatedAt: value.updatedAt,
  });
}

function legacySign(
  value: Omit<StoredAuthorityV1, "hmac">,
  installationRoot: Buffer,
): string {
  return createHmac("sha256", installationRoot)
    .update(LEGACY_HMAC_DOMAIN)
    .update("\0")
    .update(legacyCanonicalPayload(value))
    .digest("hex");
}

function parseLegacyStored(raw: string, installationRoot: Buffer): AuthorityValue {
  if (raw.length > MAX_AUTHORITY_FILE_CHARS) {
    throw new Error("Connected installation authority exceeds the size limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Connected installation authority is unreadable");
  }
  if (!isRecord(parsed)) {
    throw new Error("Connected installation authority is invalid");
  }
  const row = parsed;
  const desktopKeys = parseDesktopKeys(row.desktopKeys);
  if (
    row.formatVersion !== LEGACY_FORMAT_VERSION ||
    !HEX32.test(String(row.workspaceId ?? "")) ||
    !HEX32.test(String(row.installationId ?? "")) ||
    !desktopKeys ||
    !(row.controlToken === null || validKey(row.controlToken, 32, 256)) ||
    !(row.backupToken === null || validKey(row.backupToken, 32, 256)) ||
    !Number.isSafeInteger(row.revision) ||
    Number(row.revision) < 1 ||
    !validTimestamp(row.updatedAt) ||
    typeof row.hmac !== "string" ||
    !HEX64.test(row.hmac)
  ) {
    throw new Error("Connected installation authority is invalid");
  }

  const unsigned: Omit<StoredAuthorityV1, "hmac"> = {
    formatVersion: LEGACY_FORMAT_VERSION,
    workspaceId: String(row.workspaceId),
    installationId: String(row.installationId),
    desktopKeys,
    controlToken: row.controlToken as string | null,
    backupToken: row.backupToken as string | null,
    revision: Number(row.revision),
    updatedAt: row.updatedAt,
  };
  const expected = Buffer.from(legacySign(unsigned, installationRoot), "hex");
  const actual = Buffer.from(row.hmac, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Connected installation authority authentication failed");
  }
  return {
    workspaceId: unsigned.workspaceId,
    installationId: unsigned.installationId,
    desktopKeys: unsigned.desktopKeys,
    controlToken: unsigned.controlToken,
    backupToken: unsigned.backupToken,
    revision: unsigned.revision,
    updatedAt: unsigned.updatedAt,
  };
}

function authorityKey(
  workspaceId: string,
  installationId: string,
  installationRoot: Buffer,
) {
  return deriveInstallationKey(installationRoot, {
    workspaceId,
    installationId,
    purpose: "connected-installation-authority",
    version: KEY_VERSION,
  });
}

function metadataBytes(
  value: Omit<StoredAuthorityV2, "iv" | "ciphertext" | "tag">,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      formatVersion: value.formatVersion,
      algorithm: value.algorithm,
      keyVersion: value.keyVersion,
      keyId: value.keyId,
      workspaceId: value.workspaceId.toLowerCase(),
      installationId: value.installationId.toLowerCase(),
      revision: value.revision,
      updatedAt: value.updatedAt,
    }),
    "utf8",
  );
}

function decodeCanonicalBase64(
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
    throw new Error(`${label} is not canonical base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value ||
    (expectedLength !== undefined && decoded.length !== expectedLength)
  ) {
    decoded.fill(0);
    throw new Error(`${label} has invalid dimensions`);
  }
  return decoded;
}

function sealAuthority(
  value: AuthorityValue,
  installationRoot: Buffer,
): StoredAuthorityV2 {
  const derived = authorityKey(
    value.workspaceId,
    value.installationId,
    installationRoot,
  );
  const metadata = {
    formatVersion: FORMAT_VERSION,
    algorithm: ALGORITHM,
    keyVersion: KEY_VERSION,
    keyId: derived.descriptor.keyId,
    workspaceId: value.workspaceId,
    installationId: value.installationId,
    revision: value.revision,
    updatedAt: value.updatedAt,
  } as const;
  const iv = randomBytes(IV_BYTES);
  const plaintext = Buffer.from(
    JSON.stringify({
      desktopKeys: value.desktopKeys,
      controlToken: value.controlToken,
      backupToken: value.backupToken,
    }),
    "utf8",
  );
  try {
    const cipher = createCipheriv(ALGORITHM, derived.key, iv, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(metadataBytes(metadata));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      ...metadata,
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
  } finally {
    plaintext.fill(0);
    derived.key.fill(0);
  }
}

function parseStoredV2(raw: string, installationRoot: Buffer): AuthorityValue {
  if (raw.length > MAX_AUTHORITY_FILE_CHARS) {
    throw new Error("Connected installation authority exceeds the size limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Connected installation authority is unreadable");
  }
  if (
    !isRecord(parsed) ||
    !exactKeys(parsed, [
      "formatVersion",
      "algorithm",
      "keyVersion",
      "keyId",
      "workspaceId",
      "installationId",
      "revision",
      "updatedAt",
      "iv",
      "ciphertext",
      "tag",
    ]) ||
    parsed.formatVersion !== FORMAT_VERSION ||
    parsed.algorithm !== ALGORITHM ||
    parsed.keyVersion !== KEY_VERSION ||
    typeof parsed.keyId !== "string" ||
    !HEX64.test(parsed.keyId) ||
    !HEX32.test(String(parsed.workspaceId ?? "")) ||
    !HEX32.test(String(parsed.installationId ?? "")) ||
    !Number.isSafeInteger(parsed.revision) ||
    Number(parsed.revision) < 1 ||
    !validTimestamp(parsed.updatedAt) ||
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.tag !== "string"
  ) {
    throw new Error("Connected installation authority is invalid");
  }

  const metadata = {
    formatVersion: FORMAT_VERSION,
    algorithm: ALGORITHM,
    keyVersion: KEY_VERSION,
    keyId: parsed.keyId,
    workspaceId: String(parsed.workspaceId),
    installationId: String(parsed.installationId),
    revision: Number(parsed.revision),
    updatedAt: parsed.updatedAt,
  } as const;
  const derived = authorityKey(
    metadata.workspaceId,
    metadata.installationId,
    installationRoot,
  );
  if (derived.descriptor.keyId !== metadata.keyId) {
    derived.key.fill(0);
    throw new Error(
      "Connected installation authority belongs to another installation key",
    );
  }

  let iv: Buffer | null = null;
  let ciphertext: Buffer | null = null;
  let tag: Buffer | null = null;
  let plaintext: Buffer | null = null;
  try {
    iv = decodeCanonicalBase64(parsed.iv, "Connected authority IV", IV_BYTES);
    ciphertext = decodeCanonicalBase64(
      parsed.ciphertext,
      "Connected authority ciphertext",
    );
    tag = decodeCanonicalBase64(
      parsed.tag,
      "Connected authority tag",
      TAG_BYTES,
    );
    const decipher = createDecipheriv(ALGORITHM, derived.key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(metadataBytes(metadata));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const sensitive = parseSensitivePayload(
      JSON.parse(plaintext.toString("utf8")) as unknown,
    );
    return {
      workspaceId: metadata.workspaceId,
      installationId: metadata.installationId,
      desktopKeys: sensitive.desktopKeys,
      controlToken: sensitive.controlToken,
      backupToken: sensitive.backupToken,
      revision: metadata.revision,
      updatedAt: metadata.updatedAt,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("protected payload") ||
        error.message.startsWith("Connected authority "))
    ) {
      throw error;
    }
    throw new Error("Connected installation authority authentication failed", {
      cause: error,
    });
  } finally {
    plaintext?.fill(0);
    iv?.fill(0);
    ciphertext?.fill(0);
    tag?.fill(0);
    derived.key.fill(0);
  }
}

function snapshot(value: AuthorityValue): ConnectedInstallationAuthority {
  return Object.freeze({
    workspaceId: value.workspaceId,
    installationId: value.installationId,
    desktopKeys: value.desktopKeys,
    controlToken: value.controlToken,
    backupToken: value.backupToken,
    revision: value.revision,
  });
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function retireLegacyAuthority(): Promise<void> {
  const path = legacyAuthorityPath();
  await rm(path, { force: true });
  await syncDirectory(dirname(path));
}

async function readStored(
  installationRoot: Buffer = getMasterKey(),
): Promise<ReadAuthority | null> {
  const current = await readOptionalFile(authorityPath());
  if (current !== null) {
    return Object.freeze({
      value: parseStoredV2(current, installationRoot),
      legacy: false,
    });
  }
  const legacy = await readOptionalFile(legacyAuthorityPath());
  if (legacy === null) return null;
  return Object.freeze({
    value: parseLegacyStored(legacy, installationRoot),
    legacy: true,
  });
}

async function persist(
  value: AuthorityValue,
  installationRoot: Buffer = getMasterKey(),
): Promise<AuthorityValue> {
  const path = authorityPath();
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const stored = sealAuthority(value, installationRoot);
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(stored)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, path);
    await syncDirectory(directory);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  await retireLegacyAuthority();
  return value;
}

async function withAuthorityLock<T>(operation: () => Promise<T>): Promise<T> {
  const path = lockPath();
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 250; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      try {
        return await operation();
      } finally {
        await handle.close();
        await rm(path, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("Connected installation authority is busy");
}

async function legacyKeys(
  context: ServiceContext,
): Promise<ConnectedDesktopKeys | null> {
  const value = await getSecret(context, LEGACY_CONNECTED_DESKTOP_KEYS_SECRET);
  if (!value) return null;
  try {
    return parseDesktopKeys(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function assertScope(context: ServiceContext, value: AuthorityValue): void {
  const shop = context.shop;
  if (
    !shop ||
    value.workspaceId !== shop.workspaceId ||
    value.installationId !== shop.installationId
  ) {
    throw new Error(
      "Connected installation authority belongs to another installation",
    );
  }
}

export async function ensureConnectedInstallationAuthority(
  context: ServiceContext,
): Promise<ConnectedInstallationAuthority> {
  if (!context.shop) {
    throw new Error(
      "Connected installation authority requires trusted shop context",
    );
  }
  return withAuthorityLock(async () => {
    const existing = await readStored();
    if (existing) {
      assertScope(context, existing.value);
      if (existing.legacy) {
        await persist(existing.value);
      } else {
        await retireLegacyAuthority();
      }
      return snapshot(existing.value);
    }
    const migratedKeys = await legacyKeys(context);
    const keys = migratedKeys ?? generateConnectedKeyPair();
    const [controlToken, backupToken] = await Promise.all([
      getSecret(context, LEGACY_CONNECTED_CONTROL_TOKEN_SECRET),
      getSecret(context, LEGACY_CONNECTED_BACKUP_TOKEN_SECRET),
    ]);
    const stored = await persist({
      workspaceId: context.shop.workspaceId,
      installationId: context.shop.installationId,
      desktopKeys: keys,
      controlToken,
      backupToken,
      revision: 1,
      updatedAt: new Date().toISOString(),
    });
    return snapshot(stored);
  });
}

export async function updateConnectedInstallationTokens(
  context: ServiceContext,
  update: Readonly<{ controlToken?: string | null; backupToken?: string | null }>,
): Promise<ConnectedInstallationAuthority> {
  if (!context.shop) {
    throw new Error(
      "Connected installation authority requires trusted shop context",
    );
  }
  return withAuthorityLock(async () => {
    const current = await readStored();
    if (!current) {
      throw new Error("Connected installation authority is not initialized");
    }
    assertScope(context, current.value);
    const controlToken =
      update.controlToken === undefined
        ? current.value.controlToken
        : update.controlToken;
    const backupToken =
      update.backupToken === undefined
        ? current.value.backupToken
        : update.backupToken;
    if (
      !(controlToken === null || validKey(controlToken, 32, 256)) ||
      !(backupToken === null || validKey(backupToken, 32, 256))
    ) {
      throw new Error("Connected installation token authority is invalid");
    }
    const stored = await persist({
      workspaceId: current.value.workspaceId,
      installationId: current.value.installationId,
      desktopKeys: current.value.desktopKeys,
      controlToken,
      backupToken,
      revision: current.value.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    return snapshot(stored);
  });
}

export async function rotateConnectedInstallationAuthorityProtection(
  oldInstallationRoot: Buffer,
  newInstallationRoot: Buffer,
  dryRun = false,
): Promise<ConnectedInstallationAuthorityRotationState> {
  return withAuthorityLock(async () => {
    const currentRaw = await readOptionalFile(authorityPath());
    if (currentRaw !== null) {
      let value: AuthorityValue;
      try {
        value = parseStoredV2(currentRaw, oldInstallationRoot);
      } catch (oldError) {
        try {
          parseStoredV2(currentRaw, newInstallationRoot);
          if (!dryRun) await retireLegacyAuthority();
          return "already-current";
        } catch {
          throw oldError;
        }
      }
      if (dryRun) return "would-rotate";
      await persist(value, newInstallationRoot);
      return "rotated";
    }

    const legacyRaw = await readOptionalFile(legacyAuthorityPath());
    if (legacyRaw === null) return "missing";
    let value: AuthorityValue;
    try {
      value = parseLegacyStored(legacyRaw, oldInstallationRoot);
    } catch (oldError) {
      try {
        value = parseLegacyStored(legacyRaw, newInstallationRoot);
      } catch {
        throw oldError;
      }
      if (dryRun) return "would-rotate";
      await persist(value, newInstallationRoot);
      return "rotated";
    }
    if (dryRun) return "would-rotate";
    await persist(value, newInstallationRoot);
    return "rotated";
  });
}
