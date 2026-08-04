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
 *   without touching the filesystem. Highest priority outside packaged mode.
 *
 * RESOLUTION ORDER (getMasterKey):
 *   1. This compiled module's in-memory cache
 *   2. Process-memory packaged cache shared by duplicated Next.js chunks
 *   3. One-use native bridge (packaged runtime)
 *   4. SF_MASTER_KEY env var (development / tests only)
 *   5. Compatibility keyfile (development / tests only)
 *   6. Generate + persist a compatibility key (development / tests only)
 */
import "server-only";

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { randomBytes } from "crypto";
import { join } from "path";

const KEY_LENGTH = 32; // 256 bits
const NATIVE_ROOT_SOURCE = "native-stdin-v1";
const NATIVE_ROOT_SYMBOL = Symbol.for("sahelflow.installation-root.v1");
const NATIVE_ROOT_CACHE_SYMBOL = Symbol.for(
  "sahelflow.installation-root.cache.v1",
);

type NativeRootConsumer = () => Buffer;
type NativeRootHolder = { [key: symbol]: unknown };

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

function validateNativeRoot(value: unknown, label: string): Buffer {
  if (!Buffer.isBuffer(value) || value.length !== KEY_LENGTH) {
    throw new Error(`${label} is not a 256-bit key`);
  }
  return value;
}

/**
 * Next.js standalone output can contain more than one compiled copy of this
 * module. A module-local cache is therefore insufficient after the one-use
 * native bridge has been consumed. Keep the resolved root only in process
 * memory under a non-enumerable symbol so every compiled copy shares the same
 * authority without introducing an environment, argument, or file fallback.
 */
function processCachedNativeRoot(): Buffer | null {
  const holder = globalThis as NativeRootHolder;
  const candidate = holder[NATIVE_ROOT_CACHE_SYMBOL];
  if (candidate === undefined) return null;
  return validateNativeRoot(candidate, "The process-cached installation root");
}

function cacheNativeRootForProcess(key: Buffer): Buffer {
  const holder = globalThis as NativeRootHolder;
  const existing = holder[NATIVE_ROOT_CACHE_SYMBOL];
  if (existing !== undefined) {
    return validateNativeRoot(
      existing,
      "The process-cached installation root",
    );
  }
  Object.defineProperty(holder, NATIVE_ROOT_CACHE_SYMBOL, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: key,
  });
  return key;
}

function consumeNativeRoot(): Buffer | null {
  const holder = globalThis as NativeRootHolder;
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
  try {
    return validateNativeRoot(key, "The native installation root");
  } catch (error) {
    if (Buffer.isBuffer(key)) key.fill(0);
    throw error;
  }
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

  if (nativeRootIsRequired()) {
    const processRoot = processCachedNativeRoot();
    if (processRoot) {
      cachedKey = processRoot;
      return cachedKey;
    }
  }

  const nativeRoot = consumeNativeRoot();
  if (nativeRoot) {
    cachedKey = cacheNativeRootForProcess(nativeRoot);
    return cachedKey;
  }

  // A packaged server must never silently downgrade to an environment value,
  // plaintext file, or newly generated replacement when the one-use transfer
  // is absent or was corrupted.
  if (nativeRootIsRequired()) {
    throw new Error(
      "The packaged installation root was not transferred by the native runtime",
    );
  }

  // Development/test override.
  if (process.env.SF_MASTER_KEY) {
    cachedKey = parseHexKey(process.env.SF_MASTER_KEY, "SF_MASTER_KEY");
    return cachedKey;
  }

  // Compatibility keyfile.
  const keyFile = getKeyFilePath();
  if (existsSync(keyFile)) {
    const hex = readFileSync(keyFile, "utf8").trim();
    cachedKey = parseHexKey(hex, keyFile);
    return cachedKey;
  }

  // First run — generate + persist to keyfile (F-H4: O_EXCL, race-safe).
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const newKey = randomBytes(KEY_LENGTH);
  try {
    // "wx" = O_EXCL — fails with EEXIST if the file was created by another
    // concurrent caller between our existsSync check and this write.
    writeFileSync(keyFile, newKey.toString("hex"), {
      mode: 0o600,
      flag: "wx",
    });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "EEXIST"
    ) {
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
  return newKey;
}

/**
 * Async variant — preferred for call sites that can await.
 * (Same as sync version since Stronghold is no longer used server-side.)
 */
export async function getMasterKeyAsync(): Promise<Buffer> {
  return getMasterKey();
}

/** Rotate the master key. WARNING: re-encryption of existing secrets is the
 * caller's responsibility (this only changes what getMasterKey returns going
 * forward + overwrites the keyfile). Used by the planned key-rotation flow. */
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

/** For tests: reset this module and the process-wide packaged cache. */
export function _resetMasterKeyCacheForTests(): void {
  cachedKey = null;
  delete (globalThis as NativeRootHolder)[NATIVE_ROOT_CACHE_SYMBOL];
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
    throw new Error(
      `${label} decoded to ${buf.length} bytes (expected ${KEY_LENGTH})`,
    );
  }
  return buf;
}
