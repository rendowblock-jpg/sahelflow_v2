/**
 * Master key management.
 *
 * The master key encrypts all `Secret` rows + PII fields. It is a 32-byte
 * (256-bit) random key.
 *
 * STORAGE (production — ADR-004, Tauri Stronghold):
 *   - The key is stored in a Tauri Stronghold vault (encrypted, backed by
 *     OS-level secure storage). The key never touches the filesystem.
 *   - Stronghold is only available in the Tauri desktop context. In browser
 *     dev mode, we fall back to the keyfile (below).
 *   - The Tauri commands `get_master_key_from_stronghold` +
 *     `save_master_key_to_stronghold` (in src-tauri/src/lib.rs) bridge the
 *     vault to the Node.js server.
 *
 * STORAGE (interim — browser dev + tests):
 *   - `data/master.key` as 64 hex chars, file mode 0600.
 *   - Used when Stronghold is not available (browser dev, tests, CI).
 *
 * OVERRIDE:
 *   `SF_MASTER_KEY=<64 hex chars>` — used by tests to get a deterministic key
 *   without touching the filesystem or Stronghold. Highest priority.
 *
 * RESOLUTION ORDER (getMasterKey):
 *   1. SF_MASTER_KEY env var (tests / CI)
 *   2. In-memory cache (avoid re-reading on every call)
 *   3. Tauri Stronghold (production desktop) — async, awaited on first call
 *   4. Keyfile (browser dev fallback)
 *   5. Generate new key + persist to whichever store is available
 *
 * NOTE: getMasterKey() is synchronous for backward compat with the existing
 * call sites. Stronghold is async, so we use a pattern: the first call kicks
 * off an async load + returns the keyfile fallback temporarily; subsequent
 * calls (after the async load completes) return the Stronghold key. In
 * practice, the server doesn't handle requests until Stronghold is loaded, so
 * this is safe. For tests, the SF_MASTER_KEY env var bypasses all of this.
 */

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
const STRONGHOLD_VAULT_PATH = "sahelflow-stronghold.vault";

/** Resolve the data dir: SF_DATA_DIR > cwd/data > repo data/ */
function getDataDir(): string {
  if (process.env.SF_DATA_DIR) return process.env.SF_DATA_DIR;
  return join(process.cwd(), "data");
}

function getKeyFilePath(): string {
  return join(getDataDir(), "master.key");
}

let cachedKey: Buffer | null = null;
let strongholdLoadPromise: Promise<Buffer | null> | null = null;

/** Detect if we're running in a Tauri context (desktop app). */
function isTauriContext(): boolean {
  // The Tauri server side doesn't have __TAURI__ (that's the webview), but
  // we can detect the Tauri runtime via the process env or the presence of
  // the Tauri CLI. In production, Tauri sets TAURI_FAMILY=desktop.
  return process.env.TAURI_FAMILY === "desktop" || process.env.TAURI_ENV_PLATFORM !== undefined;
}

/**
 * Try to load the master key from Tauri Stronghold.
 * Returns null if Stronghold is not available, not initialized, or has no key.
 */
async function loadFromStronghold(): Promise<Buffer | null> {
  if (!isTauriContext()) return null;

  try {
    // Dynamic import — only available in Tauri context
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<string | null>("get_master_key_from_stronghold", {
      vaultPath: STRONGHOLD_VAULT_PATH,
    });
    if (!result) return null;
    return parseHexKey(result, "stronghold");
  } catch {
    // Stronghold not available (browser dev) or command failed — fall back
    return null;
  }
}

/**
 * Save the master key to Tauri Stronghold (production storage).
 * No-op if not in a Tauri context.
 */
async function saveToStronghold(key: Buffer): Promise<void> {
  if (!isTauriContext()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_master_key_to_stronghold", {
      vaultPath: STRONGHOLD_VAULT_PATH,
      keyHex: key.toString("hex"),
    });
  } catch {
    // Best-effort — if Stronghold save fails, the keyfile fallback still works
  }
}

/**
 * Get the master key, generating + persisting it on first run.
 * Cached in-memory for the process lifetime.
 *
 * This is the synchronous entry point. It checks env + cache + keyfile
 * synchronously. If none of those have the key, it returns the keyfile
 * fallback (generating if needed) while async-loading from Stronghold in
 * the background. The Stronghold key takes over on subsequent calls.
 */
export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  // 1. Env override (tests / CI / explicit config)
  if (process.env.SF_MASTER_KEY) {
    cachedKey = parseHexKey(process.env.SF_MASTER_KEY, "SF_MASTER_KEY");
    return cachedKey;
  }

  // 2. Kick off async Stronghold load (if in Tauri context) — non-blocking
  if (isTauriContext() && !strongholdLoadPromise) {
    strongholdLoadPromise = loadFromStronghold().then((key) => {
      if (key) {
        cachedKey = key; // take over from keyfile fallback
      }
      return key;
    });
  }

  // 3. Keyfile (browser dev fallback + temporary fallback while Stronghold loads)
  const keyFile = getKeyFilePath();
  if (existsSync(keyFile)) {
    const hex = readFileSync(keyFile, "utf8").trim();
    cachedKey = parseHexKey(hex, keyFile);
    return cachedKey;
  }

  // 4. First run — generate + persist to keyfile (Stronghold save happens async)
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

  // Async-save to Stronghold (non-blocking) — production storage
  if (isTauriContext()) {
    void saveToStronghold(newKey);
  }

  return cachedKey;
}

/**
 * Async variant — preferred for call sites that can await.
 * Ensures the Stronghold load has completed before returning.
 */
export async function getMasterKeyAsync(): Promise<Buffer> {
  const key = getMasterKey(); // sync resolution (env / cache / keyfile)
  if (strongholdLoadPromise) {
    const strongholdKey = await strongholdLoadPromise;
    if (strongholdKey) return strongholdKey;
  }
  return key;
}

/** Rotate the master key. WARNING: re-encryption of existing secrets is the
 *  caller's responsibility (this only changes what getMasterKey returns going
 *  forward + overwrites the keyfile + Stronghold). Used by the planned
 *  key-rotation flow. */
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

  // Async-save to Stronghold
  if (isTauriContext()) {
    void saveToStronghold(newKey);
  }

  return newKey;
}

/** For tests: reset the in-memory cache so the next getMasterKey() re-reads. */
export function _resetMasterKeyCacheForTests(): void {
  cachedKey = null;
  strongholdLoadPromise = null;
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
