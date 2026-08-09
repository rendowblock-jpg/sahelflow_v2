/**
 * Installation-root compatibility API.
 *
 * The historical `getMasterKey` name is retained for call-site compatibility,
 * but Phase 4 treats this 32-byte value as the installation-local wrapping and
 * derivation root. New seller PII, blind indexes and secrets use independently
 * rotatable purpose-separated authorities; they are not encrypted directly by
 * this root.
 *
 * PACKAGED WINDOWS AUTHORITY:
 *   - The native Tauri process resolves the installation root through DPAPI.
 *   - The contained Node server receives it once through an inherited stdin
 *     pipe. It is never accepted through an environment variable, argument,
 *     or plaintext keyfile in that runtime.
 *
 * OFFLINE PROTECTED-DATA MAINTENANCE:
 *   - The migration command must receive an explicitly exported installation
 *     root through `SF_PROTECTED_DATA_MIGRATION_ROOT_SOURCE`.
 *   - It never consumes the packaged one-use bridge, reads/creates master.key,
 *     or generates a development compatibility root. Clean CI/test sandboxes may
 *     continue using the explicit deterministic `SF_MASTER_KEY` fixture.
 *
 * DEVELOPMENT / TEST AUTHORITY:
 *   - `SF_MASTER_KEY` remains an explicit deterministic override.
 *   - Otherwise `data/master.key` remains the non-packaged compatibility path.
 *
 * OVERRIDE:
 *   `SF_MASTER_KEY=<64 hex chars>` — used by tests to get a deterministic root
 *   without touching the filesystem. Highest priority outside packaged mode.
 *
 * RESOLUTION ORDER (getMasterKey):
 *   1. Explicit offline protected-data maintenance export, when that command runs
 *   2. This compiled module's in-memory cache
 *   3. Process-memory packaged cache shared by duplicated Next.js chunks/realms
 *   4. One-use native bridge (packaged runtime)
 *   5. SF_MASTER_KEY env var (development / tests only)
 *   6. Compatibility keyfile (development / tests only)
 *   7. Generate + persist a compatibility root (development / tests only)
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
const OFFLINE_MIGRATION_ROOT_SOURCE_ENV =
  "SF_PROTECTED_DATA_MIGRATION_ROOT_SOURCE";
const NATIVE_ROOT_SYMBOL = Symbol.for("sahelflow.installation-root.v1");
const NATIVE_ROOT_CACHE_SYMBOL = Symbol.for(
  "sahelflow.installation-root.cache.v1",
);

type NativeRootConsumer = () => Buffer;
type NativeRootHolder = { [key: symbol]: unknown };
type CodedError = Error & { code: string };

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

function offlineProtectedDataMaintenanceIsRunning(): boolean {
  const lifecycle = process.env.npm_lifecycle_event ?? "";
  if (lifecycle.startsWith("protected-data:")) return true;

  return process.argv.some((argument) =>
    /(?:^|[\\/])migrate-protected-data-v1\.(?:ts|js|cjs|mjs)$/i.test(argument),
  );
}

function codedError(code: string, message: string): CodedError {
  return Object.assign(new Error(message), { code });
}

function readExplicitOfflineMaintenanceRoot(): Buffer {
  const deterministicFixture = process.env.SF_MASTER_KEY;
  const deterministicFixtureAllowed =
    process.env.GITHUB_ACTIONS === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true";
  if (deterministicFixture && deterministicFixtureAllowed) {
    return parseHexKey(deterministicFixture, "SF_MASTER_KEY");
  }

  const source = process.env[OFFLINE_MIGRATION_ROOT_SOURCE_ENV]?.trim();
  if (!source) {
    throw codedError(
      "PROTECTED_DATA_MIGRATION_ROOT_REQUIRED",
      `Offline protected-data maintenance requires an explicit exported installation root through ${OFFLINE_MIGRATION_ROOT_SOURCE_ENV}`,
    );
  }
  if (!existsSync(source)) {
    throw codedError(
      "PROTECTED_DATA_MIGRATION_ROOT_UNAVAILABLE",
      `The exported installation-root source does not exist: ${source}`,
    );
  }

  let serialized: string;
  try {
    serialized = readFileSync(source, "utf8");
  } catch (cause) {
    throw codedError(
      "PROTECTED_DATA_MIGRATION_ROOT_UNAVAILABLE",
      `The exported installation-root source could not be read: ${String(cause)}`,
    );
  }
  try {
    return parseHexKey(serialized, OFFLINE_MIGRATION_ROOT_SOURCE_ENV);
  } catch (cause) {
    throw codedError(
      "PROTECTED_DATA_MIGRATION_ROOT_INVALID",
      `The exported installation-root source is invalid: ${String(cause)}`,
    );
  }
}

function validateNativeRoot(value: unknown, label: string): Buffer {
  if (!Buffer.isBuffer(value) || value.length !== KEY_LENGTH) {
    throw new Error(`${label} is not a 256-bit key`);
  }
  return value;
}

function processNativeRootHolder(): NativeRootHolder {
  return process as unknown as NativeRootHolder;
}

/**
 * Next.js standalone output can contain more than one compiled copy/realm of
 * this module. A module-local cache and a realm-local globalThis cache are both
 * insufficient after the one-use native bridge has been consumed. Keep the
 * resolved root only in process memory under a non-enumerable symbol so every
 * compiled server realm shares the same authority without introducing an
 * environment, argument, or file fallback.
 */
function processCachedNativeRoot(): Buffer | null {
  const holder = processNativeRootHolder();
  const candidate = holder[NATIVE_ROOT_CACHE_SYMBOL];
  if (candidate === undefined) return null;
  return validateNativeRoot(candidate, "The process-cached installation root");
}

function cacheNativeRootForProcess(key: Buffer): Buffer {
  const holder = processNativeRootHolder();
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
 * Resolve the installation root, generating and persisting the compatibility
 * root only in non-packaged development/test mode.
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
  // This maintenance command can target an installed AppData directory while
  // the packaged process is intentionally stopped. Resolve only an explicit,
  // operator-supplied export before consulting any cache or compatibility path.
  if (offlineProtectedDataMaintenanceIsRunning()) {
    if (!cachedKey) cachedKey = readExplicitOfflineMaintenanceRoot();
    return cachedKey;
  }

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

/** Async installation-root resolver for call sites that can await. */
export async function getMasterKeyAsync(): Promise<Buffer> {
  return getMasterKey();
}

/**
 * Rotate only the non-packaged compatibility root. Packaged installation-root
 * rotation must use the native protected path, which re-wraps persisted Phase 4
 * authorities before switching roots.
 */
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
  delete processNativeRootHolder()[NATIVE_ROOT_CACHE_SYMBOL];
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
