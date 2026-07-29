/**
 * Master key management.
 *
 * The master key encrypts all `Secret` rows + PII fields. It is a 32-byte
 * (256-bit) random key.
 *
 * PACKAGED WINDOWS AUTHORITY:
 *   - The native Tauri process resolves the installation root through DPAPI.
 *   - The contained Node server receives it once through an inherited stdin
 *     pipe. It is never accepted through an environment variable, argument,
 *     or plaintext keyfile in that runtime.
 *
 * DEVELOPMENT / TEST AUTHORITY:
 *   - `SF_MASTER_KEY` remains an explicit deterministic override.
 *   - Otherwise `data/master.key` remains the non-packaged compatibility path.
 *
 * OVERRIDE:
 *   `SF_MASTER_KEY=<64 hex chars>` — used by tests to get a deterministic key
 *   without touching the filesystem. Highest priority.
 *
 * RESOLUTION ORDER (getMasterKey):
 *   1. In-memory cache (avoid re-reading on every call)
 *   2. One-use native bridge (packaged runtime)
 *   3. SF_MASTER_KEY env var (development / tests only)
 *   4. Compatibility keyfile (development / tests only)
 *   5. Generate + persist a compatibility key (development / tests only)
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
const NATIVE_ROOT_SOURCE = "native-stdin-v1";
const NATIVE_ROOT_SYMBOL = Symbol.for("sahelflow.installation-root.v1");

type NativeRootConsumer = () => Buffer;

/** Resolve the data dir: SF_DATA_DIR > cwd/data > repo data/ */
function getDataDir(): string {
  if (process.env.SF_DATA_DIR) return process.env.SF_DATA_DIR;
  return join(process.cwd(), "data");
}

function getKeyFilePath(): string {
  return join(getDataDir(), "master.key");
}

let cachedKey: Buffer | null = null;

function nativeRootIsRequired(): boolean {
  return process.env.SF_INSTALLATION_ROOT_SOURCE === NATIVE_ROOT_SOURCE;
}

function consumeNativeRoot(): Buffer | null {
  const holder = globalThis as { [key: symbol]: unknown };
  const candidate = holder[NATIVE_ROOT_SYMBOL];
  if (candidate === undefined) return null;
  if (typeof candidate !== "function") {
    delete holder[NATIVE_ROOT_SYMBOL];
    throw new Error("The native installation-root bridge is invalid");
  }

  let key: unknown;
  try {
    key = (candidate as NativeRootConsumer)();
  } finally {
    // The bootstrap also deletes its bridge before returning. Deleting here
    // makes the one-use property explicit even in focused unit tests.
    delete holder[NATIVE_ROOT_SYMBOL];
  }
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    if (Buffer.isBuffer(key)) key.fill(0);
    throw new Error("The native installation root is not a 256-bit key");
  }
  return key;
}

/**
 * Get the master key, generating + persisting it on first run.
 * Cached in-memory for the process lifetime.
 *
 * F-H4: race-safe first-run generation. Previously two concurrent calls both
 * saw cachedKey===null AND !existsSync(keyFile) → each generated a different
 * key, each wrote its key (second write wins) → first caller's cachedKey was
 * stale → data it encrypted was permanently unreadable after restart. Fix:
 * use `writeFileSync` with `flag: "wx"` (O_EXCL) — if another caller wrote
 * the file between our existsSync check and the write, this throws EEXIST
 * and we re-read the winning key. No async/Promise needed (generation is
 * synchronous), so no caller changes required.
 */
export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const nativeRoot = consumeNativeRoot();
  if (nativeRoot) {
    cachedKey = nativeRoot;
    return cachedKey;
  }

  // A packaged server must never silently downgrade to an environment value,
  // plaintext file, or newly generated replacement when the one-use transfer
  // is absent or was corrupted.
  if (nativeRootIsRequired()) {
    throw new Error("The packaged installation root was not transferred by the native runtime");
  }

  // Development/test override.
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

  // 3. First run — generate + persist to keyfile (F-H4: O_EXCL, race-safe)
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const newKey = randomBytes(KEY_LENGTH);
  try {
    // "wx" = O_EXCL — fails with EEXIST if the file was created by another
    // concurrent caller between our existsSync check and this write.
    writeFileSync(keyFile, newKey.toString("hex"), { mode: 0o600, flag: "wx" });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "EEXIST") {
      // Lost the race — re-read the winning key instead of overwriting it.
      const hex = readFileSync(keyFile, "utf8").trim();
      cachedKey = parseHexKey(hex, keyFile);
      return cachedKey;
    }
    throw err;
  }
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
  if (nativeRootIsRequired()) {
    throw new Error(
      "Packaged installation-root rotation requires the native protected rotation path",
    );
  }
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
