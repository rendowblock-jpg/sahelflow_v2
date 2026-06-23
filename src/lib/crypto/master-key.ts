/**
 * Master key management.
 *
 * The master key encrypts all `Secret` rows + PII fields. It is a 32-byte
 * (256-bit) random key.
 *
 * STORAGE:
 *   - `data/master.key` as 64 hex chars, file mode 0600.
 *   - The Stronghold plugin is registered for webview-side secure storage,
 *     but the server-side master key uses the keyfile (see ADR-004).
 *   - In the Tauri desktop context, the keyfile lives in the app's data dir.
 *
 * OVERRIDE:
 *   `SF_MASTER_KEY=<64 hex chars>` — used by tests to get a deterministic key
 *   without touching the filesystem. Highest priority.
 *
 * RESOLUTION ORDER (getMasterKey):
 *   1. SF_MASTER_KEY env var (tests / CI)
 *   2. In-memory cache (avoid re-reading on every call)
 *   3. Keyfile
 *   4. Generate new key + persist to keyfile
 */
import "server-only";


import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
} from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

const KEY_LENGTH = 32; // 256 bits

/** Resolve the data dir: SF_DATA_DIR > cwd/data > repo data/ */
function getDataDir(): string {
  if (process.env.SF_DATA_DIR) return process.env.SF_DATA_DIR;
  return join(process.cwd(), "data");
}

function getKeyFilePath(): string {
  return join(getDataDir(), "master.key");
}

let cachedKey: Buffer | null = null;

/**
 * Get the master key, generating + persisting it on first run.
 * Cached in-memory for the process lifetime.
 */
export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  // 1. Env override (tests / CI / explicit config)
  if (process.env.SF_MASTER_KEY) {
    cachedKey = parseHexKey(process.env.SF_MASTER_KEY, "SF_MASTER_KEY");
    return cachedKey;
  }

  // 2. Keyfile
  const keyFile = getKeyFilePath();
  if (existsSync(keyFile)) {
    const hex = readFileSync(keyFile, "utf8").trim();
    cachedKey = parseHexKey(hex, keyFile);
    return cachedKey;
  }

  // 3. First run — generate + persist to keyfile
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const newKey = randomBytes(KEY_LENGTH);
  writeFileSync(keyFile, newKey.toString("hex"), { mode: 0o600 });
  try {
    chmodSync(keyFile, 0o600);
  } catch {
    // Best-effort; on some platforms chmod may be restricted.
  }
  cachedKey = newKey;
  return cachedKey;
}

/**
 * Async variant — preferred for call sites that can await.
 * (Same as sync version since Stronghold is no longer used server-side.)
 */
export async function getMasterKeyAsync(): Promise<Buffer> {
  return getMasterKey();
}

/** Rotate the master key. WARNING: re-encryption of existing secrets is the
 *  caller's responsibility (this only changes what getMasterKey returns going
 *  forward + overwrites the keyfile). Used by the planned key-rotation flow. */
export function rotateMasterKey(): Buffer {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const newKey = randomBytes(KEY_LENGTH);
  writeFileSync(getKeyFilePath(), newKey.toString("hex"), { mode: 0o600 });
  try {
    chmodSync(getKeyFilePath(), 0o600);
  } catch {
    /* best effort */
  }
  cachedKey = newKey;
  return newKey;
}

/** For tests: reset the in-memory cache so the next getMasterKey() re-reads. */
export function _resetMasterKeyCacheForTests(): void {
  cachedKey = null;
}

function parseHexKey(hex: string, label: string): Buffer {
  const trimmed = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      `${label} must be 64 hex chars (32 bytes / 256-bit). Got ${trimmed.length} chars.`,
    );
  }
  const buf = Buffer.from(trimmed, "hex");
  if (buf.length !== KEY_LENGTH) {
    throw new Error(`${label} decoded to ${buf.length} bytes (expected ${KEY_LENGTH})`);
  }
  return buf;
}
