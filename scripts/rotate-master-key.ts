import "server-only";

import { PrismaClient } from "@prisma/client";
import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { basename, isAbsolute, join, resolve } from "node:path";

import {
  decryptString,
  deriveBlindIndex,
  encryptString,
  isEncryptedPayload,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import { rewrapShopProtectedKeys } from "@/lib/crypto/protected-key-authority";
import { isProtectedValueEnvelope } from "@/lib/crypto/protected-value";
import { rotateIdentityAuthorityAuthentication } from "@/lib/identity/control-authority";
import {
  MASTER_KEY_ROTATION_LOCK_FILE,
  MASTER_KEY_ROTATION_LOCK_FORMAT_VERSION,
  parseMasterKeyRotationLock,
  type MasterKeyRotationLockRecord,
} from "@/lib/maintenance/master-key-rotation";
import type { ShopContext } from "@/lib/shops/context";

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const RECOVER_STALE_LOCK = process.argv.includes("--recover-stale-lock");
const BOOTSTRAP_CHECK = process.argv.includes("--bootstrap-check");
const BOOTSTRAP_READY_MARKER = "SF_ROTATION_BOOTSTRAP_READY";
const KEY_BYTES = 32;
const ROTATION_TRANSACTION_MAX_WAIT_MS = 30_000;
const ROTATION_TRANSACTION_TIMEOUT_MS = 5 * 60_000;
const NATIVE_ROTATION_SOURCE = "native-stdin-v1";
const NATIVE_ROTATION_MAGIC = Buffer.from("SFRKRT01", "ascii");
const NATIVE_ROTATION_FRAME_BYTES = NATIVE_ROTATION_MAGIC.length + KEY_BYTES * 2;
const NATIVE_ROTATION =
  process.env.SF_INSTALLATION_ROOT_ROTATION_SOURCE === NATIVE_ROTATION_SOURCE;
const REGISTRY_FORMAT_VERSION = 2;
const RUNTIME_MANIFEST_FORMAT_VERSION = 1;
const ORDER_FIELDS = ["phone", "address", "notes"] as const;
const CONVERSATION_FIELDS = ["contactName", "contactPhone"] as const;

interface RotationTarget {
  id: string;
  databasePath: string;
  context: ShopContext | null;
}

interface RegistryShape {
  formatVersion: number;
  revision: number;
  workspaceId: string;
  installationId: string;
  shops: Array<{
    id: string;
    incarnationId: string;
    databaseFile: string;
  }>;
}

interface ModelStats {
  shopId: string;
  model: string;
  total: number;
  rotated: number;
  alreadyNew: number;
  plaintext: number;
}

interface RotationLease {
  handle: number;
  record: MasterKeyRotationLockRecord;
}

type RotationStage =
  | "lease"
  | "runtime-stop"
  | "target-discovery"
  | "root-loading"
  | "database-client"
  | "database-connect"
  | "protected-key-authority"
  | "customers"
  | "orders"
  | "conversations"
  | "messages"
  | "secrets"
  | "database-disconnect"
  | "identity-authority"
  | "root-commit";

interface RuntimeEndpointManifest {
  formatVersion: number;
  state: string;
  host: string;
  appPort: number;
  processId: number;
}

interface NativeRotationRoots {
  oldKey: Buffer;
  newKey: Buffer;
}

type ValueState = "plaintext" | "canonical" | "rotated" | "already-new";

interface ValueRotation {
  stored: string | null;
  plaintext: string | null;
  state: ValueState;
}

let nativeRotationRoots: NativeRotationRoots | null = null;

function readNativeRotationRoots(): NativeRotationRoots {
  if (!NATIVE_ROTATION) {
    throw new Error("The native protected rotation frame was not requested");
  }
  if (nativeRotationRoots) return nativeRotationRoots;
  if (DRY_RUN || FORCE) {
    throw new Error("Native protected rotation does not accept --dry-run or --force");
  }

  const frame = Buffer.alloc(NATIVE_ROTATION_FRAME_BYTES);
  try {
    let offset = 0;
    while (offset < frame.length) {
      const read = readSync(0, frame, offset, frame.length - offset, null);
      if (read === 0) {
        throw new Error("The native protected rotation frame is incomplete");
      }
      offset += read;
    }
    const extra = Buffer.alloc(1);
    try {
      if (
        readSync(0, extra, 0, 1, null) !== 0 ||
        !timingSafeEqual(
          frame.subarray(0, NATIVE_ROTATION_MAGIC.length),
          NATIVE_ROTATION_MAGIC,
        )
      ) {
        throw new Error("The native protected rotation frame is invalid");
      }
    } finally {
      extra.fill(0);
    }
    nativeRotationRoots = {
      oldKey: Buffer.from(frame.subarray(8, 8 + KEY_BYTES)),
      newKey: Buffer.from(frame.subarray(8 + KEY_BYTES)),
    };
    if (timingSafeEqual(nativeRotationRoots.oldKey, nativeRotationRoots.newKey)) {
      throw new Error("The native protected rotation candidate matches the current root");
    }
    return nativeRotationRoots;
  } finally {
    frame.fill(0);
  }
}

function clearNativeRotationRoots(): void {
  nativeRotationRoots?.oldKey.fill(0);
  nativeRotationRoots?.newKey.fill(0);
  nativeRotationRoots = null;
}

function dataDir(): string {
  return process.env.SF_DATA_DIR
    ? resolve(process.env.SF_DATA_DIR)
    : resolve(process.cwd(), "data");
}

const KEYFILE_PATH = join(dataDir(), "master.key");
const SIDECAR_PATH = join(dataDir(), "master.key.new");
const LOCK_PATH = join(dataDir(), MASTER_KEY_ROTATION_LOCK_FILE);
const RUNTIME_MANIFEST_PATH = join(dataDir(), "runtime-endpoint.json");
const REGISTRY_PATH = join(dataDir(), "shop-registry.json");
const SHOPS_DIR = join(dataDir(), "shops");
const SHOP_TEMPLATE_PATH = join(dataDir(), "system", "shop-template.db");
const PROTECTED_INSTALLATION_ROOT_PATHS = [
  join(dataDir(), "system", "installation-root.current.json"),
  join(dataDir(), "system", "installation-root.candidate.json"),
  join(dataDir(), "system", "installation-root.backup.json"),
] as const;

function delegateProtectedRotation(): void {
  if (process.platform !== "win32") {
    throw new Error("Native protected installation-root rotation is available only on Windows");
  }
  if (DRY_RUN || FORCE) {
    throw new Error("Native protected rotation does not accept --dry-run or --force");
  }
  const appData = process.env.APPDATA;
  const programFiles = process.env.ProgramW6432 ?? process.env.ProgramFiles;
  if (!appData || !programFiles) {
    throw new Error("Windows AppData or Program Files authority is unavailable");
  }
  const installedDataDir = resolve(appData, "com.sahelflow.desktop");
  if (resolve(dataDir()).toLowerCase() !== installedDataDir.toLowerCase()) {
    throw new Error(
      "Protected rotation delegation is restricted to the installed SahelFlow AppData directory",
    );
  }
  const executable = resolve(programFiles, "SahelFlow", "sahelflow.exe");
  if (!existsSync(executable)) {
    throw new Error(`Installed SahelFlow rotation authority is missing: ${executable}`);
  }
  const result = spawnSync(executable, ["--rotate-installation-root"], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Native protected installation-root rotation failed with exit code ${result.status ?? "unknown"}`,
    );
  }
  console.log("Native protected installation-root rotation completed.");
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

function readKey(path: string): Buffer {
  const hex = readFileSync(path, "utf8").trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(`${path} must contain exactly 64 hexadecimal characters`);
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${path} decoded to ${key.length} bytes instead of ${KEY_BYTES}`);
  }
  return key;
}

function loadOldKey(): Buffer {
  if (NATIVE_ROTATION) return Buffer.from(readNativeRotationRoots().oldKey);
  if (process.env.SF_MASTER_KEY) {
    throw new Error(
      "SF_MASTER_KEY is set. Unset it before rotating the installation keyfile.",
    );
  }
  if (!existsSync(KEYFILE_PATH)) {
    throw new Error(`Master keyfile is missing: ${KEYFILE_PATH}`);
  }
  return readKey(KEYFILE_PATH);
}

function fsyncDirectory(directoryPath: string): void {
  if (process.platform === "win32") return;
  const directoryHandle = openSync(directoryPath, "r");
  try {
    fsyncSync(directoryHandle);
  } finally {
    closeSync(directoryHandle);
  }
}

function powershellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function moveFileWriteThroughWindows(source: string, target: string): void {
  const command = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SahelFlowDurableMove {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool MoveFileEx(string existingFileName, string newFileName, int flags);
}
'@
$ok = [SahelFlowDurableMove]::MoveFileEx(
  ${powershellLiteral(source)},
  ${powershellLiteral(target)},
  8
)
if (-not $ok) {
  $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  Write-Error "MoveFileEx(MOVEFILE_WRITE_THROUGH) failed with Win32 error $code"
  exit 1
}
`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr ||
        result.stdout ||
        "Could not durably publish the master-key rotation sidecar",
    );
  }
}

function writeDurableSidecar(newKey: Buffer): void {
  mkdirSync(dataDir(), { recursive: true });
  const temporaryPath = `${SIDECAR_PATH}.${process.pid}.${randomUUID()}.tmp`;
  const sidecarHandle = openSync(temporaryPath, "wx", 0o600);
  try {
    writeFileSync(sidecarHandle, newKey.toString("hex"), "utf8");
    fsyncSync(sidecarHandle);
  } finally {
    closeSync(sidecarHandle);
  }

  try {
    if (process.platform === "win32") {
      moveFileWriteThroughWindows(temporaryPath, SIDECAR_PATH);
    } else {
      renameSync(temporaryPath, SIDECAR_PATH);
      fsyncDirectory(dataDir());
    }
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }

  try {
    chmodSync(SIDECAR_PATH, 0o600);
  } catch {
    // Best effort on platforms that do not expose POSIX modes.
  }
}

function loadOrCreateNewKey(oldKey: Buffer): Buffer {
  if (NATIVE_ROTATION) {
    const roots = readNativeRotationRoots();
    if (!timingSafeEqual(oldKey, roots.oldKey)) {
      throw new Error("The native current installation root changed during rotation startup");
    }
    return Buffer.from(roots.newKey);
  }
  if (existsSync(SIDECAR_PATH)) {
    const resumed = readKey(SIDECAR_PATH);
    if (!resumed.equals(oldKey)) {
      console.warn(`Resuming installation-wide rotation from ${SIDECAR_PATH}`);
      return resumed;
    }
    if (!FORCE) {
      throw new Error(
        `${SIDECAR_PATH} matches the current master key. Remove it or rerun with --force.`,
      );
    }
    if (!DRY_RUN) unlinkSync(SIDECAR_PATH);
  }

  const newKey = randomBytes(KEY_BYTES);
  if (!DRY_RUN) writeDurableSidecar(newKey);
  return newKey;
}

function readExistingRotationLock(): MasterKeyRotationLockRecord {
  return parseMasterKeyRotationLock(
    JSON.parse(readFileSync(LOCK_PATH, "utf8")),
  );
}

function removeStaleRotationLock(expectedToken: string | null): void {
  if (!existsSync(LOCK_PATH)) return;
  if (expectedToken !== null) {
    const current = readExistingRotationLock();
    if (current.token !== expectedToken) {
      throw new Error(
        "The rotation lock changed ownership while stale recovery was in progress",
      );
    }
  }
  unlinkSync(LOCK_PATH);
}

function acquireRotationLease(): RotationLease {
  mkdirSync(dataDir(), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = openSync(LOCK_PATH, "wx", 0o600);
      const record: MasterKeyRotationLockRecord = {
        formatVersion: MASTER_KEY_ROTATION_LOCK_FORMAT_VERSION,
        ownerPid: process.pid,
        token: randomUUID().replaceAll("-", ""),
        createdAt: new Date().toISOString(),
      };
      try {
        writeFileSync(handle, `${JSON.stringify(record, null, 2)}\n`, "utf8");
        fsyncSync(handle);
        try {
          chmodSync(LOCK_PATH, 0o600);
        } catch {
          // Best effort on platforms that do not expose POSIX modes.
        }
        return { handle, record };
      } catch (error) {
        closeSync(handle);
        if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH);
        throw error;
      }
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;

      let existing: MasterKeyRotationLockRecord | null = null;
      try {
        existing = readExistingRotationLock();
      } catch {
        if (!RECOVER_STALE_LOCK && !FORCE) {
          throw new Error(
            `The rotation lease at ${LOCK_PATH} is malformed. After verifying SahelFlow is closed, rerun with --recover-stale-lock.`,
          );
        }
        console.warn(`Recovering malformed stale rotation lease: ${LOCK_PATH}`);
        removeStaleRotationLock(null);
        continue;
      }

      if (processIsAlive(existing.ownerPid)) {
        throw new Error(
          `Another live master-key rotation owns ${LOCK_PATH} (PID ${existing.ownerPid}, token ${existing.token})`,
        );
      }

      if (!RECOVER_STALE_LOCK && !FORCE) {
        throw new Error(
          `Stale rotation lease from dead PID ${existing.ownerPid}. Rerun with --recover-stale-lock to resume the durable sidecar generation.`,
        );
      }
      console.warn(
        `Recovering stale rotation lease from dead PID ${existing.ownerPid}; the existing sidecar preserves crash-resume authority.`,
      );
      removeStaleRotationLock(existing.token);
    }
  }

  throw new Error(`Could not acquire master-key rotation lease: ${LOCK_PATH}`);
}

function finishRotationLease(
  lease: RotationLease,
  removeLease: boolean,
): void {
  closeSync(lease.handle);
  if (!removeLease) {
    console.error(
      `Maintenance lease retained at ${LOCK_PATH}; SahelFlow startup and writes remain blocked until this rotation is resumed successfully.`,
    );
    return;
  }
  if (!existsSync(LOCK_PATH)) return;
  try {
    const current = readExistingRotationLock();
    if (current.token !== lease.record.token) {
      console.warn(`Rotation lease ownership changed; refusing to remove ${LOCK_PATH}`);
      return;
    }
    unlinkSync(LOCK_PATH);
  } catch {
    console.warn(`Rotation lease became unreadable; refusing to remove ${LOCK_PATH}`);
  }
}

function readRuntimeManifest(): RuntimeEndpointManifest {
  const value = JSON.parse(
    readFileSync(RUNTIME_MANIFEST_PATH, "utf8"),
  ) as Partial<RuntimeEndpointManifest>;
  if (
    value.formatVersion !== RUNTIME_MANIFEST_FORMAT_VERSION ||
    value.state !== "ready" ||
    value.host !== "127.0.0.1" ||
    !Number.isSafeInteger(value.appPort) ||
    (value.appPort ?? 0) <= 0 ||
    (value.appPort ?? 0) > 65_535 ||
    !Number.isSafeInteger(value.processId) ||
    (value.processId ?? 0) <= 0
  ) {
    throw new Error("Runtime endpoint manifest is malformed");
  }
  return {
    formatVersion: RUNTIME_MANIFEST_FORMAT_VERSION,
    state: "ready",
    host: "127.0.0.1",
    appPort: value.appPort!,
    processId: value.processId!,
  };
}

function loopbackPortIsOpen(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const socket = connect({ host: "127.0.0.1", port });
    let settled = false;
    const settle = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePort(open);
    };
    socket.setTimeout(500);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

async function assertApplicationStopped(): Promise<void> {
  if (!existsSync(RUNTIME_MANIFEST_PATH)) return;

  let manifest: RuntimeEndpointManifest;
  try {
    manifest = readRuntimeManifest();
  } catch {
    if (!FORCE) {
      throw new Error(
        `Cannot prove SahelFlow is stopped because ${RUNTIME_MANIFEST_PATH} is malformed. Verify the app is closed, then rerun with --force.`,
      );
    }
    console.warn(
      `Ignoring malformed runtime manifest after explicit --force: ${RUNTIME_MANIFEST_PATH}`,
    );
    return;
  }

  const ownerAlive = processIsAlive(manifest.processId);
  const serverListening = await loopbackPortIsOpen(manifest.appPort);
  if (ownerAlive || serverListening) {
    throw new Error(
      `SahelFlow is still running (PID ${manifest.processId}, port ${manifest.appPort}). Close the desktop app before rotating the master key.`,
    );
  }

  console.warn(
    `Ignoring stale runtime manifest for dead PID ${manifest.processId}; the maintenance lease prevents a new packaged server from starting or writing.`,
  );
}

function databasePathFromUrl(databaseUrl: string): string {
  const match = databaseUrl.match(/^file:(.+)$/);
  if (!match?.[1]) {
    throw new Error("DATABASE_URL must be a file: SQLite URL");
  }
  const path = decodeURIComponent(match[1]);
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function isIdentity(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/i.test(value);
}

function registryContext(
  registry: RegistryShape,
  shop: RegistryShape["shops"][number],
): ShopContext {
  if (
    !Number.isSafeInteger(registry.revision) ||
    registry.revision < 1 ||
    !isIdentity(registry.workspaceId) ||
    !isIdentity(registry.installationId) ||
    !isIdentity(shop.incarnationId)
  ) {
    throw new Error("Shop registry identity is incomplete for protected-key rotation");
  }
  return Object.freeze({
    workspaceId: registry.workspaceId,
    installationId: registry.installationId,
    shopId: shop.id,
    shopIncarnationId: shop.incarnationId,
    registryRevision: registry.revision,
    databaseFileId: shop.databaseFile,
    migrationSetSha256: "0".repeat(64),
  });
}

function validateRegistryTarget(
  registry: RegistryShape,
  shop: RegistryShape["shops"][number],
): RotationTarget {
  if (!shop.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(shop.id)) {
    throw new Error("Shop registry contains an invalid shop ID");
  }
  const safeName = basename(shop.databaseFile);
  if (
    safeName !== shop.databaseFile ||
    !/^[a-z0-9][a-z0-9-]*\.db$/.test(safeName)
  ) {
    throw new Error(`Shop ${shop.id} has an invalid database file identity`);
  }
  const databasePath = join(SHOPS_DIR, safeName);
  if (!existsSync(databasePath)) {
    throw new Error(`Registered shop database is missing: ${databasePath}`);
  }
  return {
    id: shop.id,
    databasePath,
    context: registryContext(registry, shop),
  };
}

function environmentContext(databasePath: string): ShopContext | null {
  const workspaceId = process.env.SF_WORKSPACE_ID;
  const installationId = process.env.SF_INSTALLATION_ID;
  const shopId = process.env.SF_ACTIVE_SHOP_ID;
  const shopIncarnationId = process.env.SF_SHOP_INCARNATION_ID;
  const databaseFileId = process.env.SF_DATABASE_FILE_ID;
  const registryRevision = Number.parseInt(process.env.SF_REGISTRY_REVISION ?? "", 10);
  if (
    !isIdentity(workspaceId) ||
    !isIdentity(installationId) ||
    !shopId ||
    !isIdentity(shopIncarnationId) ||
    databaseFileId !== basename(databasePath) ||
    !Number.isSafeInteger(registryRevision) ||
    registryRevision < 1
  ) {
    return null;
  }
  return Object.freeze({
    workspaceId,
    installationId,
    shopId,
    shopIncarnationId,
    registryRevision,
    databaseFileId,
    migrationSetSha256: process.env.SF_MIGRATION_SET_SHA256 ?? "0".repeat(64),
  });
}

function loadRotationTargets(): RotationTarget[] {
  const targets: RotationTarget[] = [];

  if (existsSync(REGISTRY_PATH)) {
    const parsed = JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as RegistryShape;
    if (
      parsed.formatVersion !== REGISTRY_FORMAT_VERSION ||
      !Array.isArray(parsed.shops)
    ) {
      throw new Error("The canonical shop registry is invalid or unsupported");
    }
    targets.push(...parsed.shops.map((shop) => validateRegistryTarget(parsed, shop)));
  }

  if (existsSync(SHOP_TEMPLATE_PATH)) {
    targets.push({
      id: "system-shop-template",
      databasePath: SHOP_TEMPLATE_PATH,
      context: null,
    });
  }

  if (targets.length === 0) {
    const fallback = process.env.DATABASE_URL;
    if (!fallback) {
      throw new Error(
        "No registered shops, shop template, or DATABASE_URL database was found",
      );
    }
    const databasePath = databasePathFromUrl(fallback);
    if (!existsSync(databasePath)) {
      throw new Error(`DATABASE_URL database is missing: ${databasePath}`);
    }
    targets.push({
      id: "database-url",
      databasePath,
      context: environmentContext(databasePath),
    });
  }

  const unique = new Map<string, RotationTarget>();
  for (const target of targets) {
    unique.set(resolve(target.databasePath), {
      ...target,
      databasePath: resolve(target.databasePath),
    });
  }
  return [...unique.values()];
}

function encryptedPayload(json: string): EncryptedPayload {
  const parsed = JSON.parse(json) as Partial<EncryptedPayload>;
  if (
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.tag !== "string"
  ) {
    throw new Error("Malformed encrypted payload");
  }
  return {
    iv: parsed.iv,
    ciphertext: parsed.ciphertext,
    tag: parsed.tag,
  };
}

function rotateStoredValue(
  value: string | null,
  oldKey: Buffer,
  newKey: Buffer,
): ValueRotation {
  if (value === null) {
    return { stored: null, plaintext: null, state: "plaintext" };
  }
  if (isProtectedValueEnvelope(value)) {
    return { stored: value, plaintext: null, state: "canonical" };
  }
  if (!isEncryptedPayload(value)) {
    return { stored: value, plaintext: value, state: "plaintext" };
  }

  const payload = encryptedPayload(value);
  try {
    const plaintext = decryptString(payload, oldKey);
    return {
      stored: JSON.stringify(encryptString(plaintext, newKey)),
      plaintext,
      state: "rotated",
    };
  } catch {
    try {
      const plaintext = decryptString(payload, newKey);
      return { stored: value, plaintext, state: "already-new" };
    } catch {
      throw new Error("Legacy protected value is undecryptable under both rotation roots");
    }
  }
}

function stats(shopId: string, model: string, total: number): ModelStats {
  return {
    shopId,
    model,
    total,
    rotated: 0,
    alreadyNew: 0,
    plaintext: 0,
  };
}

function recordRowState(result: ModelStats, values: readonly ValueRotation[]): void {
  if (values.some((value) => value.state === "rotated")) {
    result.rotated += 1;
  } else if (
    values.some(
      (value) => value.state === "canonical" || value.state === "already-new",
    )
  ) {
    result.alreadyNew += 1;
  } else {
    result.plaintext += 1;
  }
}

async function rotateCustomers(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.customer.findMany();
  const result = stats(shopId, "Customer", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      let name: ValueRotation;
      let phone: ValueRotation;
      let phone2: ValueRotation;
      let address: ValueRotation;
      let notes: ValueRotation;
      try {
        name = rotateStoredValue(row.name, oldKey, newKey);
        phone = rotateStoredValue(row.phoneEnc, oldKey, newKey);
        phone2 = rotateStoredValue(row.phone2, oldKey, newKey);
        address = rotateStoredValue(row.address, oldKey, newKey);
        notes = rotateStoredValue(row.notes, oldKey, newKey);
      } catch (cause) {
        throw new Error(`Shop ${shopId}: Customer ${row.id} is undecryptable`, {
          cause,
        });
      }
      const values = [name, phone, phone2, address, notes];
      recordRowState(result, values);
      const changed = values.some((value) => value.state === "rotated");
      if (DRY_RUN || !changed) continue;

      await tx.customer.update({
        where: { id: row.id },
        data: {
          name: name.stored!,
          phone:
            phone.state === "rotated" && phone.plaintext !== null
              ? deriveBlindIndex(phone.plaintext, newKey)
              : row.phone,
          phoneEnc: phone.stored,
          nameBlindIndex:
            name.state === "rotated" && name.plaintext !== null
              ? deriveBlindIndex(name.plaintext, newKey)
              : row.nameBlindIndex,
          phone2: phone2.stored,
          address: address.stored,
          notes: notes.stored,
        },
      });
    }
  });
  return result;
}

async function rotateOrders(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.order.findMany();
  const result = stats(shopId, "Order", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      let phone: ValueRotation;
      let address: ValueRotation;
      let notes: ValueRotation;
      try {
        phone = rotateStoredValue(row.phone, oldKey, newKey);
        address = rotateStoredValue(row.address, oldKey, newKey);
        notes = rotateStoredValue(row.notes, oldKey, newKey);
      } catch (cause) {
        throw new Error(`Shop ${shopId}: Order ${row.id} is undecryptable`, {
          cause,
        });
      }
      const values = [phone, address, notes];
      recordRowState(result, values);
      const changed = values.some((value) => value.state === "rotated");
      if (DRY_RUN || !changed) continue;

      await tx.order.update({
        where: { id: row.id },
        data: {
          phone: phone.stored!,
          phoneBlindIndex:
            phone.state === "rotated" && phone.plaintext !== null
              ? deriveBlindIndex(phone.plaintext, newKey)
              : row.phoneBlindIndex,
          address: address.stored!,
          notes: notes.stored,
        },
      });
    }
  });
  return result;
}

async function rotateConversations(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.conversation.findMany();
  const result = stats(shopId, "Conversation", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      let name: ValueRotation;
      let phone: ValueRotation;
      try {
        name = rotateStoredValue(row.contactName, oldKey, newKey);
        phone = rotateStoredValue(row.contactPhone, oldKey, newKey);
      } catch (cause) {
        throw new Error(`Shop ${shopId}: Conversation ${row.id} is undecryptable`, {
          cause,
        });
      }
      const values = [name, phone];
      recordRowState(result, values);
      const changed = values.some((value) => value.state === "rotated");
      if (DRY_RUN || !changed) continue;

      await tx.conversation.update({
        where: { id: row.id },
        data: {
          contactName: name.stored!,
          contactPhone: phone.stored,
        },
      });
    }
  });
  return result;
}

async function rotateMessages(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.message.findMany();
  const result = stats(shopId, "Message", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      let body: ValueRotation;
      try {
        body = rotateStoredValue(row.body, oldKey, newKey);
      } catch (cause) {
        throw new Error(`Shop ${shopId}: Message ${row.id} is undecryptable`, {
          cause,
        });
      }
      recordRowState(result, [body]);
      if (DRY_RUN || body.state !== "rotated") continue;
      await tx.message.update({
        where: { id: row.id },
        data: { body: body.stored! },
      });
    }
  });
  return result;
}

async function rotateSecrets(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.secret.findMany();
  const result = stats(shopId, "Secret", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      if (isProtectedValueEnvelope(row.ciphertext)) {
        result.alreadyNew += 1;
        continue;
      }
      const payload: EncryptedPayload = {
        iv: row.iv,
        ciphertext: row.ciphertext,
        tag: row.tag,
      };
      let plaintext: string;
      try {
        plaintext = decryptString(payload, oldKey);
      } catch {
        try {
          decryptString(payload, newKey);
          result.alreadyNew += 1;
          continue;
        } catch (cause) {
          throw new Error(
            `Shop ${shopId}: Secret ${row.id} (${row.key}) is undecryptable`,
            { cause },
          );
        }
      }

      result.rotated += 1;
      if (DRY_RUN) continue;
      const reEncrypted = encryptString(plaintext, newKey);
      await tx.secret.update({
        where: { id: row.id },
        data: reEncrypted,
      });
    }
  });
  return result;
}

async function rotateProtectedKeyAuthority(
  client: PrismaClient,
  target: RotationTarget,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const count = await client.protectedKeyAuthority.count();
  if (count === 0) return stats(target.id, "ProtectedKeyAuthority", 0);
  if (!target.context) {
    throw new Error(
      `Shop ${target.id} contains protected key authority without an exact registry context`,
    );
  }
  const rewrapped = await rewrapShopProtectedKeys(
    client,
    target.context,
    oldKey,
    newKey,
    DRY_RUN,
  );
  return {
    shopId: target.id,
    model: "ProtectedKeyAuthority",
    total: rewrapped.total,
    rotated: rewrapped.rewrapped,
    alreadyNew: rewrapped.alreadyCurrent,
    plaintext: 0,
  };
}

async function rotateTarget(
  target: RotationTarget,
  oldKey: Buffer,
  newKey: Buffer,
  reportStage: (stage: RotationStage) => void,
): Promise<ModelStats[]> {
  reportStage("database-client");
  const client = new PrismaClient({
    datasourceUrl: `file:${target.databasePath}`,
    log: ["error"],
    transactionOptions: {
      maxWait: ROTATION_TRANSACTION_MAX_WAIT_MS,
      timeout: ROTATION_TRANSACTION_TIMEOUT_MS,
    },
  });
  try {
    reportStage("database-connect");
    await client.$connect();
    const result: ModelStats[] = [];
    reportStage("protected-key-authority");
    result.push(
      await rotateProtectedKeyAuthority(client, target, oldKey, newKey),
    );
    reportStage("customers");
    result.push(await rotateCustomers(client, target.id, oldKey, newKey));
    reportStage("orders");
    result.push(await rotateOrders(client, target.id, oldKey, newKey));
    reportStage("conversations");
    result.push(await rotateConversations(client, target.id, oldKey, newKey));
    reportStage("messages");
    result.push(await rotateMessages(client, target.id, oldKey, newKey));
    reportStage("secrets");
    result.push(await rotateSecrets(client, target.id, oldKey, newKey));
    reportStage("database-disconnect");
    await client.$disconnect();
    return result;
  } catch (error) {
    try {
      await client.$disconnect();
    } catch (disconnectError) {
      reportStage("database-disconnect");
      throw disconnectError;
    }
    throw error;
  }
}

function commitKeyfile(newKey: Buffer): string {
  if (NATIVE_ROTATION) {
    const roots = readNativeRotationRoots();
    if (!timingSafeEqual(newKey, roots.newKey)) {
      throw new Error("The rotated databases do not match the native protected candidate");
    }
    return "native protected installation-root backup";
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${KEYFILE_PATH}.old-${timestamp}`;
  copyFileSync(KEYFILE_PATH, backupPath);
  try {
    chmodSync(backupPath, 0o600);
  } catch {
    // Best effort.
  }

  try {
    renameSync(SIDECAR_PATH, KEYFILE_PATH);
  } catch (error) {
    copyFileSync(backupPath, KEYFILE_PATH);
    throw error;
  }

  try {
    chmodSync(KEYFILE_PATH, 0o600);
  } catch {
    // Best effort.
  }
  if (!readKey(KEYFILE_PATH).equals(newKey)) {
    copyFileSync(backupPath, KEYFILE_PATH);
    throw new Error("The committed master key does not match the rotation sidecar");
  }
  return backupPath;
}

function printStats(allStats: readonly ModelStats[]): void {
  console.log("");
  console.log(
    `${"Shop".padEnd(24)} ${"Model".padEnd(24)} ${"Total".padStart(7)} ${
      (DRY_RUN ? "WouldRotate" : "Rotated").padStart(12)
    } ${"AlreadyNew".padStart(11)} ${"Plaintext".padStart(10)}`,
  );
  console.log("-".repeat(94));
  for (const item of allStats) {
    console.log(
      `${item.shopId.padEnd(24)} ${item.model.padEnd(24)} ${String(
        item.total,
      ).padStart(7)} ${String(item.rotated).padStart(12)} ${String(
        item.alreadyNew,
      ).padStart(11)} ${String(item.plaintext).padStart(10)}`,
    );
  }
}

async function main(): Promise<void> {
  if (BOOTSTRAP_CHECK) {
    console.log(BOOTSTRAP_READY_MARKER);
    return;
  }

  if (
    !NATIVE_ROTATION &&
    PROTECTED_INSTALLATION_ROOT_PATHS.some((path) => existsSync(path))
  ) {
    delegateProtectedRotation();
    return;
  }
  let lease: RotationLease | null = null;
  let mutationWindowEntered = false;
  let keyfileCommitted = false;
  let retainMaintenanceLease = false;
  let oldKey: Buffer | null = null;
  let newKey: Buffer | null = null;
  let stage: RotationStage = "lease";

  try {
    lease = acquireRotationLease();
    stage = "runtime-stop";
    await assertApplicationStopped();

    stage = "target-discovery";
    const targets = loadRotationTargets();
    stage = "root-loading";
    oldKey = loadOldKey();
    newKey = loadOrCreateNewKey(oldKey);
    if (oldKey.equals(newKey)) {
      throw new Error("The old and new master keys are identical");
    }

    console.log(
      DRY_RUN
        ? "Master-key rotation dry run"
        : "Installation-wide master-key rotation",
    );
    console.log(
      NATIVE_ROTATION
        ? "Key authority: native protected current/candidate"
        : `Keyfile: ${KEYFILE_PATH}`,
    );
    console.log(`Maintenance lease: ${LOCK_PATH}`);
    console.log(`Registered database targets: ${targets.length}`);
    for (const target of targets) {
      console.log(` - ${target.id}: ${target.databasePath}`);
    }

    const allStats: ModelStats[] = [];
    if (!DRY_RUN) mutationWindowEntered = true;

    for (const target of targets) {
      allStats.push(
        ...(await rotateTarget(target, oldKey, newKey, (nextStage) => {
          stage = nextStage;
        })),
      );
    }

    stage = "identity-authority";
    const identityAuthority = rotateIdentityAuthorityAuthentication(
      oldKey,
      newKey,
      DRY_RUN,
    );
    console.log(`Identity authority: ${identityAuthority.state}`);
    printStats(allStats);

    if (DRY_RUN) {
      console.log("\nDry run complete. No database or keyfile changes were written.");
      return;
    }

    stage = "root-commit";
    const backupPath = commitKeyfile(newKey);
    keyfileCommitted = true;
    console.log("\nRotation complete.");
    console.log(`Old key backup: ${backupPath}`);
    console.log(
      NATIVE_ROTATION
        ? "New key authority: native candidate awaiting protected commit"
        : `New keyfile: ${KEYFILE_PATH}`,
    );
    console.log(
      "Every protected shop key was re-wrapped without changing seller ciphertext; remaining authenticated legacy values and installation identity were rotated before the shared root commit.",
    );
  } catch (error) {
    console.error(
      `SF_ROTATION_STAGE_${stage.replaceAll("-", "_").toUpperCase()}`,
    );
    retainMaintenanceLease =
      !DRY_RUN && mutationWindowEntered && !keyfileCommitted;
    if (retainMaintenanceLease) {
      console.error(
        "Rotation entered the database mutation window but did not commit the new keyfile. The maintenance lease will remain in place so the app cannot start or write against mixed-key data.",
      );
    }
    throw error;
  } finally {
    if (lease) finishRotationLease(lease, !retainMaintenanceLease);
    oldKey?.fill(0);
    newKey?.fill(0);
    clearNativeRotationRoots();
  }
}

main().catch((error) => {
  console.error("Master-key rotation failed.");
  if (!NATIVE_ROTATION && existsSync(SIDECAR_PATH)) {
    console.error(
      `Keep ${SIDECAR_PATH}; rerunning will resume with the same new key.`,
    );
  }
  if (existsSync(LOCK_PATH)) {
    console.error(
      `Keep ${LOCK_PATH}; it intentionally blocks SahelFlow until a successful resume.`,
    );
  }
  console.error(error);
  process.exitCode = 1;
});
