import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { getWhatsAppInboundSpoolStorageKey } from "./protected-storage-key";

const ENVELOPE_FORMAT_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const PURPOSE = "sahelflow/whatsapp/inbound-spool/v1";
const LEGACY_KEY_RETIREMENT_SUFFIX = ".retiring";

interface EncryptedSpoolEnvelope {
  formatVersion: typeof ENVELOPE_FORMAT_VERSION;
  spoolId: string;
  algorithm: typeof ALGORITHM;
  iv: string;
  tag: string;
  ciphertext: string;
}

function exactKey(value: Buffer): Buffer {
  if (value.length !== 32) {
    throw new Error("WhatsApp inbound spool encryption key must be 32 bytes");
  }
  return Buffer.from(value);
}

function parseHexKey(value: string, source: string): Buffer {
  const normalized = value.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`${source} must contain exactly 64 hexadecimal characters`);
  }
  return Buffer.from(normalized, "hex");
}

function dataDirectory(): string {
  return resolve(process.env.SF_DATA_DIR ?? join(process.cwd(), "data"));
}

function defaultSpoolDirectory(): string {
  return resolve(dataDirectory(), "whatsapp-inbound-spool");
}

function keyFilePath(): string {
  return resolve(
    process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY_FILE ??
      join(dataDirectory(), "whatsapp-inbound-spool.key"),
  );
}

function legacyKeyRetirementPath(path: string): string {
  return `${path}${LEGACY_KEY_RETIREMENT_SUFFIX}`;
}

function syncParentDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(dirname(path), "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function persistGeneratedKey(path: string, key: Buffer): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${key.toString("hex")}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o600);
  } catch {
    // Windows ACLs remain authoritative when POSIX chmod is unavailable.
  }
  renameSync(temporary, path);
  syncParentDirectory(path);
}

function assertRegularFile(path: string): void {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("WhatsApp inbound spool authority contains an unsafe file");
  }
}

function eraseLegacyKeyFile(path: string): void {
  assertRegularFile(path);
  const length = lstatSync(path).size;
  const descriptor = openSync(path, "w", 0o600);
  try {
    if (length > 0) writeFileSync(descriptor, Buffer.alloc(length));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  rmSync(path, { force: true });
  syncParentDirectory(path);
}

function spoolIdFromName(name: string): string | null {
  const match = /^([0-9a-f]{64})\.json$/.exec(name);
  return match?.[1] ?? null;
}

function assertSpoolDirectory(directory: string): void {
  if (!existsSync(directory)) return;
  const directoryMetadata = lstatSync(directory);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new Error("WhatsApp inbound spool directory is unsafe");
  }
}

function verifyProtectedSpoolRecords(directory: string, key: Buffer): void {
  if (!existsSync(directory)) return;
  assertSpoolDirectory(directory);
  for (const name of readdirSync(directory)) {
    const spoolId = spoolIdFromName(name);
    if (!spoolId) continue;
    const path = join(directory, name);
    assertRegularFile(path);
    openWhatsAppInboundSpoolRecord(readFileSync(path, "utf8"), spoolId, key);
  }
}

function writeMigratedRecord(path: string, serialized: string): void {
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, serialized, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o600);
  } catch {
    // Windows ACLs remain authoritative when POSIX chmod is unavailable.
  }
  renameSync(temporary, path);
  syncParentDirectory(path);
}

function migrateLegacySpoolRecords(
  directory: string,
  oldKey: Buffer,
  newKey: Buffer,
): void {
  if (!existsSync(directory)) return;
  assertSpoolDirectory(directory);

  for (const name of readdirSync(directory)) {
    const spoolId = spoolIdFromName(name);
    if (!spoolId) continue;
    const path = join(directory, name);
    assertRegularFile(path);
    const serialized = readFileSync(path, "utf8");
    try {
      openWhatsAppInboundSpoolRecord(serialized, spoolId, newKey);
      continue;
    } catch {
      // A legacy record is expected to fail under the new protected sub-key.
    }

    let plaintext: string;
    try {
      plaintext = openWhatsAppInboundSpoolRecord(serialized, spoolId, oldKey);
    } catch (error) {
      throw new Error("Legacy WhatsApp inbound spool cannot be migrated safely", {
        cause: error,
      });
    }
    const migrated = sealWhatsAppInboundSpoolRecord(spoolId, plaintext, newKey);
    writeMigratedRecord(path, migrated);
    const verified = openWhatsAppInboundSpoolRecord(
      readFileSync(path, "utf8"),
      spoolId,
      newKey,
    );
    if (verified !== plaintext) {
      throw new Error("WhatsApp inbound spool migration changed queued content");
    }
  }

  verifyProtectedSpoolRecords(directory, newKey);
}

function retireLegacyKeyFile(
  legacyPath: string,
  directory: string,
  protectedKey: Buffer,
): void {
  assertRegularFile(legacyPath);
  const retirementPath = legacyKeyRetirementPath(legacyPath);
  if (existsSync(retirementPath)) {
    throw new Error("WhatsApp inbound spool key retirement is ambiguous");
  }
  renameSync(legacyPath, retirementPath);
  syncParentDirectory(legacyPath);
  // Once the old authority has been atomically renamed, prove all queued data
  // is readable with the protected sub-key before any destructive erasure.
  verifyProtectedSpoolRecords(directory, protectedKey);
  eraseLegacyKeyFile(retirementPath);
}

function recoverInterruptedRetirement(
  legacyPath: string,
  directory: string,
  protectedKey: Buffer,
): void {
  const retirementPath = legacyKeyRetirementPath(legacyPath);
  if (!existsSync(retirementPath)) return;
  if (existsSync(legacyPath)) {
    throw new Error("WhatsApp inbound spool key retirement is ambiguous");
  }
  // The tombstone may contain the original key or a partially/fully zeroed
  // overwrite. Its contents are intentionally irrelevant: protected records
  // are the authority for deciding whether destructive cleanup is safe.
  assertRegularFile(retirementPath);
  verifyProtectedSpoolRecords(directory, protectedKey);
  eraseLegacyKeyFile(retirementPath);
}

function recoverUnreadableLegacyRemnant(
  legacyPath: string,
  directory: string,
  protectedKey: Buffer,
): void {
  // Older builds could crash after zeroing the original key path but before
  // unlinking it. Never parse or trust that remnant. Only retire it when every
  // queued record is already authenticated by the protected key.
  verifyProtectedSpoolRecords(directory, protectedKey);
  eraseLegacyKeyFile(legacyPath);
}

function protectedSpoolKey(directory: string): Buffer {
  const key = getWhatsAppInboundSpoolStorageKey();
  const legacyPath = keyFilePath();
  try {
    recoverInterruptedRetirement(legacyPath, directory, key);
  } catch (error) {
    key.fill(0);
    throw error;
  }
  if (!existsSync(legacyPath)) return key;

  let oldKey: Buffer;
  try {
    oldKey = parseHexKey(readFileSync(legacyPath, "utf8"), legacyPath);
  } catch (error) {
    try {
      recoverUnreadableLegacyRemnant(legacyPath, directory, key);
      return key;
    } catch (recoveryError) {
      key.fill(0);
      throw new Error("Unreadable legacy WhatsApp inbound spool key cannot be retired safely", {
        cause: recoveryError,
      });
    }
  }

  try {
    migrateLegacySpoolRecords(directory, oldKey, key);
    retireLegacyKeyFile(legacyPath, directory, key);
    return key;
  } catch (error) {
    key.fill(0);
    throw error;
  } finally {
    oldKey.fill(0);
  }
}

/**
 * Resolve a restart-stable, purpose-separated spool key.
 *
 * Packaged runtime always derives this key from the DPAPI-protected WhatsApp
 * storage root. A legacy plaintext spool key is retained only long enough to
 * re-encrypt every queued record and is erased after a full new-key readback.
 * Retirement first atomically renames the legacy authority to a recoverable
 * tombstone so power loss during overwrite/unlink cannot strand migrated data.
 * Development/test compatibility remains explicit and cannot weaken packaged
 * production because production rejects those raw-key escape hatches.
 */
export function resolveWhatsAppInboundSpoolKey(
  spoolDirectory = defaultSpoolDirectory(),
): Buffer {
  const production = process.env.NODE_ENV === "production";
  if (production) {
    if (
      process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY ||
      process.env.SF_MASTER_KEY ||
      process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY_FILE
    ) {
      throw new Error("Packaged WhatsApp inbound spool refuses raw key authority");
    }
    return protectedSpoolKey(resolve(spoolDirectory));
  }

  const dedicated = process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY;
  if (dedicated) return parseHexKey(dedicated, "SF_WHATSAPP_INGRESS_SPOOL_KEY");

  // Tests and explicit development can exercise the protected storage design
  // without requiring Windows DPAPI.
  if (process.env.SF_WHATSAPP_STORAGE_KEY) {
    return protectedSpoolKey(resolve(spoolDirectory));
  }

  const master = process.env.SF_MASTER_KEY;
  if (master) {
    const masterKey = parseHexKey(master, "SF_MASTER_KEY");
    try {
      return createHmac("sha256", masterKey).update(PURPOSE, "utf8").digest();
    } finally {
      masterKey.fill(0);
    }
  }

  const path = keyFilePath();
  if (existsSync(path)) {
    return parseHexKey(readFileSync(path, "utf8"), path);
  }

  const generated = randomBytes(32);
  persistGeneratedKey(path, generated);
  return generated;
}

function aad(spoolId: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(spoolId)) {
    throw new Error("Invalid WhatsApp inbound spool ID");
  }
  return Buffer.from(`${PURPOSE}\0${spoolId}`, "utf8");
}

export function sealWhatsAppInboundSpoolRecord(
  spoolId: string,
  plaintext: string,
  key: Buffer,
): string {
  const encryptionKey = exactKey(key);
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
    cipher.setAAD(aad(spoolId));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const envelope: EncryptedSpoolEnvelope = {
      formatVersion: ENVELOPE_FORMAT_VERSION,
      spoolId,
      algorithm: ALGORITHM,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    return `${JSON.stringify(envelope)}\n`;
  } finally {
    encryptionKey.fill(0);
    iv.fill(0);
  }
}

export function openWhatsAppInboundSpoolRecord(
  serialized: string,
  expectedSpoolId: string,
  key: Buffer,
): string {
  const parsed = JSON.parse(serialized) as Partial<EncryptedSpoolEnvelope>;
  if (
    parsed.formatVersion !== ENVELOPE_FORMAT_VERSION ||
    parsed.algorithm !== ALGORITHM ||
    parsed.spoolId !== expectedSpoolId ||
    typeof parsed.iv !== "string" ||
    typeof parsed.tag !== "string" ||
    typeof parsed.ciphertext !== "string"
  ) {
    throw new Error(
      "Unsupported or mismatched WhatsApp inbound spool envelope",
    );
  }

  const encryptionKey = exactKey(key);
  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const ciphertext = Buffer.from(parsed.ciphertext, "base64");
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAAD(aad(expectedSpoolId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
  } finally {
    encryptionKey.fill(0);
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
  }
}
