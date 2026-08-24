import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
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

import { getWhatsAppAuthStorageKey } from "./protected-storage-key";

const RECORD_FORMAT_VERSION = 1 as const;
const MARKER_FORMAT_VERSION = 1 as const;
const ALGORITHM = "aes-256-gcm" as const;
const RECORD_PURPOSE = "sahelflow/whatsapp/auth-state/record/v1";
const KEY_ID_PURPOSE = "sahelflow/whatsapp/auth-state/key-id/v1";
const PROTECTED_DIRECTORY = "whatsapp-auth-protected";
const LEGACY_DIRECTORY = "whatsapp-auth";
const MARKER_FILE = "authority.json";
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const MAX_RECORD_ID_CHARS = 4_096;
const HEX_64 = /^[0-9a-f]{64}$/i;

interface ProtectedRecordEnvelope {
  formatVersion: typeof RECORD_FORMAT_VERSION;
  algorithm: typeof ALGORITHM;
  purpose: typeof RECORD_PURPOSE;
  recordId: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

interface AuthorityMarker {
  formatVersion: typeof MARKER_FORMAT_VERSION;
  state: "ready";
  recordFormatVersion: typeof RECORD_FORMAT_VERSION;
  storageKeyId: string;
  createdAt: string;
}

function dataDirectory(): string {
  return resolve(process.env.SF_DATA_DIR ?? join(process.cwd(), "data"));
}

export function protectedWhatsAppAuthDirectory(): string {
  return join(dataDirectory(), PROTECTED_DIRECTORY);
}

export function legacyWhatsAppAuthDirectory(): string {
  return join(dataDirectory(), LEGACY_DIRECTORY);
}

function markerPath(): string {
  return join(protectedWhatsAppAuthDirectory(), MARKER_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertDirectoryOrMissing(path: string): void {
  try {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("WhatsApp authentication authority directory is unsafe");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

function assertRegularFile(path: string): void {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("WhatsApp authentication authority record is unsafe");
  }
  if (metadata.size <= 0 || metadata.size > MAX_RECORD_BYTES) {
    throw new Error("WhatsApp authentication authority record has invalid size");
  }
}

function ensureProtectedDirectory(): void {
  const path = protectedWhatsAppAuthDirectory();
  assertDirectoryOrMissing(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertDirectoryOrMissing(path);
  try {
    chmodSync(path, 0o700);
  } catch {
    // Windows ACLs remain authoritative when POSIX chmod is unavailable.
  }
}

function syncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function flushCommittedFile(path: string): void {
  const descriptor = openSync(path, "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeDurable(path: string, content: string): void {
  ensureProtectedDirectory();
  const temporary = join(
    dirname(path),
    `.${createHash("sha256").update(path).digest("hex").slice(0, 16)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, content, "utf8");
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
  flushCommittedFile(path);
  syncDirectory(dirname(path));
}

function keyId(key: Buffer): string {
  return createHash("sha256").update(KEY_ID_PURPOSE, "utf8").update(key).digest("hex");
}

function validateRecordId(recordId: string): void {
  if (
    recordId.length < 1 ||
    recordId.length > MAX_RECORD_ID_CHARS ||
    [...recordId].some((character) => character.charCodeAt(0) < 0x20)
  ) {
    throw new Error("WhatsApp authentication record ID is invalid");
  }
}

/** Preserve Baileys' historical multi-file filename canonicalization exactly. */
function baileysFileName(file: string): string {
  return file.replaceAll("/", "__").replaceAll(":", "-");
}

function recordPath(recordId: string): string {
  validateRecordId(recordId);
  const id = createHash("sha256")
    .update("sahelflow.whatsapp.auth-state.filename.v1\0", "utf8")
    .update(recordId, "utf8")
    .digest("hex");
  return join(protectedWhatsAppAuthDirectory(), `${id}.sfauth`);
}

function aad(recordId: string): Buffer {
  validateRecordId(recordId);
  return Buffer.from(`${RECORD_PURPOSE}\0${recordId}`, "utf8");
}

function sealRecord(recordId: string, value: unknown, key: Buffer): string {
  const plaintext = Buffer.from(JSON.stringify(value, BufferJSON.replacer), "utf8");
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(aad(recordId));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope: ProtectedRecordEnvelope = {
      formatVersion: RECORD_FORMAT_VERSION,
      algorithm: ALGORITHM,
      purpose: RECORD_PURPOSE,
      recordId,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    return `${JSON.stringify(envelope)}\n`;
  } finally {
    plaintext.fill(0);
    iv.fill(0);
  }
}

function canonicalBase64(value: unknown, label: string, expectedLength?: number): Buffer {
  if (
    typeof value !== "string" ||
    (value !== "" &&
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
  ) {
    throw new Error(`${label} is invalid`);
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value ||
    (expectedLength !== undefined && decoded.length !== expectedLength)
  ) {
    decoded.fill(0);
    throw new Error(`${label} is invalid`);
  }
  return decoded;
}

function openRecord<T>(recordId: string, key: Buffer): T | null {
  const path = recordPath(recordId);
  if (!existsSync(path)) return null;
  assertRegularFile(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error("WhatsApp authentication authority is unreadable");
  }
  if (
    !isRecord(parsed) ||
    parsed.formatVersion !== RECORD_FORMAT_VERSION ||
    parsed.algorithm !== ALGORITHM ||
    parsed.purpose !== RECORD_PURPOSE ||
    parsed.recordId !== recordId
  ) {
    throw new Error("WhatsApp authentication authority is invalid");
  }
  const iv = canonicalBase64(parsed.iv, "WhatsApp authentication IV", 12);
  const tag = canonicalBase64(parsed.tag, "WhatsApp authentication tag", 16);
  const ciphertext = canonicalBase64(parsed.ciphertext, "WhatsApp authentication ciphertext");
  let plaintext: Buffer | null = null;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(aad(recordId));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"), BufferJSON.reviver) as T;
  } catch (error) {
    throw new Error("WhatsApp authentication authority authentication failed", {
      cause: error,
    });
  } finally {
    plaintext?.fill(0);
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
  }
}

function writeRecord(recordId: string, value: unknown, key: Buffer): void {
  const path = recordPath(recordId);
  writeDurable(path, sealRecord(recordId, value, key));
  const verified = openRecord<unknown>(recordId, key);
  if (verified === null) {
    throw new Error("WhatsApp authentication authority write did not persist");
  }
}

function removeRecord(recordId: string): void {
  const path = recordPath(recordId);
  if (!existsSync(path)) return;
  assertRegularFile(path);
  rmSync(path, { force: true });
  syncDirectory(protectedWhatsAppAuthDirectory());
}

function parseMarker(key: Buffer): AuthorityMarker | null {
  const path = markerPath();
  if (!existsSync(path)) return null;
  assertRegularFile(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error("WhatsApp authentication authority marker is unreadable");
  }
  if (
    !isRecord(parsed) ||
    parsed.formatVersion !== MARKER_FORMAT_VERSION ||
    parsed.state !== "ready" ||
    parsed.recordFormatVersion !== RECORD_FORMAT_VERSION ||
    typeof parsed.storageKeyId !== "string" ||
    !HEX_64.test(parsed.storageKeyId) ||
    parsed.storageKeyId !== keyId(key) ||
    typeof parsed.createdAt !== "string" ||
    !Number.isFinite(Date.parse(parsed.createdAt))
  ) {
    throw new Error("WhatsApp authentication authority marker is invalid");
  }
  return parsed as unknown as AuthorityMarker;
}

function writeMarker(key: Buffer): void {
  const marker: AuthorityMarker = {
    formatVersion: MARKER_FORMAT_VERSION,
    state: "ready",
    recordFormatVersion: RECORD_FORMAT_VERSION,
    storageKeyId: keyId(key),
    createdAt: new Date().toISOString(),
  };
  writeDurable(markerPath(), `${JSON.stringify(marker)}\n`);
  if (!parseMarker(key)) {
    throw new Error("WhatsApp authentication authority marker was not persisted");
  }
}

function looksLikeAuthenticationCreds(value: unknown): value is AuthenticationCreds {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.registrationId) &&
    value.noiseKey !== undefined &&
    value.signedIdentityKey !== undefined &&
    typeof value.advSecretKey === "string" &&
    typeof value.registered === "boolean"
  );
}

function requireProtectedCreds(key: Buffer): AuthenticationCreds {
  const creds = openRecord<unknown>("creds.json", key);
  if (!looksLikeAuthenticationCreds(creds)) {
    throw new Error("WhatsApp protected authentication credentials are invalid");
  }
  return creds;
}

function legacyRecordNames(): string[] {
  const directory = legacyWhatsAppAuthDirectory();
  assertDirectoryOrMissing(directory);
  if (!existsSync(directory)) return [];
  const names: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".json")) {
      throw new Error("Legacy WhatsApp authentication state contains an unsafe entry");
    }
    names.push(entry.name);
  }
  return names.sort();
}

function readLegacyRecord(recordId: string): unknown {
  const path = join(legacyWhatsAppAuthDirectory(), recordId);
  assertRegularFile(path);
  try {
    return JSON.parse(readFileSync(path, "utf8"), BufferJSON.reviver) as unknown;
  } catch {
    throw new Error("Legacy WhatsApp authentication state is unreadable");
  }
}

function retireLegacyDirectory(): void {
  const directory = legacyWhatsAppAuthDirectory();
  assertDirectoryOrMissing(directory);
  if (!existsSync(directory)) return;
  rmSync(directory, { recursive: true, force: true });
  syncDirectory(dataDirectory());
}

function protectedRecordFiles(): string[] {
  ensureProtectedDirectory();
  return readdirSync(protectedWhatsAppAuthDirectory())
    .filter((name) => /^[0-9a-f]{64}\.sfauth$/.test(name))
    .sort();
}

function migrateLegacyAuthority(key: Buffer, names: readonly string[]): AuthenticationCreds {
  ensureProtectedDirectory();
  const expectedFiles = new Set(names.map((name) => recordPath(name).split(/[\\/]/).pop()!));
  for (const file of protectedRecordFiles()) {
    if (!expectedFiles.has(file)) {
      rmSync(join(protectedWhatsAppAuthDirectory(), file), { force: true });
    }
  }
  for (const name of names) {
    writeRecord(name, readLegacyRecord(name), key);
  }
  const creds = requireProtectedCreds(key);
  writeMarker(key);
  requireProtectedCreds(key);
  retireLegacyDirectory();
  return creds;
}

function prepareAuthority(key: Buffer): AuthenticationCreds {
  ensureProtectedDirectory();
  const marker = parseMarker(key);
  if (marker) {
    const creds = requireProtectedCreds(key);
    retireLegacyDirectory();
    return creds;
  }

  const legacyNames = legacyRecordNames();
  if (legacyNames.length > 0) {
    if (!legacyNames.includes("creds.json")) {
      throw new Error("Legacy WhatsApp authentication state has no credentials authority");
    }
    return migrateLegacyAuthority(key, legacyNames);
  }

  const partial = protectedRecordFiles();
  if (partial.length > 0) {
    // Fresh first-use publication may have durably written encrypted creds just
    // before the marker. Because the record is AEAD-authenticated under the
    // current storage key, completing the marker is safe and resumable.
    const creds = requireProtectedCreds(key);
    writeMarker(key);
    retireLegacyDirectory();
    return creds;
  }

  const creds = initAuthCreds();
  writeRecord("creds.json", creds, key);
  writeMarker(key);
  retireLegacyDirectory();
  return creds;
}

export async function useProtectedWhatsAppAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const key = getWhatsAppAuthStorageKey();
  if (key.length !== 32) {
    key.fill(0);
    throw new Error("WhatsApp authentication storage key has invalid dimensions");
  }
  const creds = prepareAuthority(key);
  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        for (const id of ids) {
          const recordId = baileysFileName(`${String(type)}-${id}.json`);
          let value = openRecord<SignalDataTypeMap[typeof type]>(recordId, key);
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(
              value as unknown as Record<string, unknown>,
            ) as unknown as SignalDataTypeMap[typeof type];
          }
          if (value !== null) result[id] = value;
        }
        return result;
      },
      set: async (data) => {
        for (const [category, entries] of Object.entries(
          data as unknown as Record<string, Record<string, unknown | null | undefined>>,
        )) {
          for (const [id, value] of Object.entries(entries)) {
            const recordId = baileysFileName(`${category}-${id}.json`);
            if (value === null || value === undefined) {
              removeRecord(recordId);
            } else {
              writeRecord(recordId, value, key);
            }
          }
        }
      },
    },
  };
  return {
    state,
    saveCreds: async () => {
      writeRecord("creds.json", creds, key);
    },
  };
}

export function clearProtectedWhatsAppAuthState(): void {
  for (const path of [
    protectedWhatsAppAuthDirectory(),
    legacyWhatsAppAuthDirectory(),
  ]) {
    assertDirectoryOrMissing(path);
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }
  if (existsSync(dataDirectory())) syncDirectory(dataDirectory());
}

export function protectedWhatsAppAuthKeyIdForTests(): string {
  const key = getWhatsAppAuthStorageKey();
  try {
    return keyId(key);
  } finally {
    key.fill(0);
  }
}

export function protectedWhatsAppAuthRecordPathForTests(recordId: string): string {
  return recordPath(recordId);
}
