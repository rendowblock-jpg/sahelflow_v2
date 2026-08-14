import "server-only";

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { BackupEntry } from "@/lib/backup";
import type { ServiceContext } from "@/lib/data/service-base";
import { env } from "@/lib/env";
import { canonicalBackupVerificationBytes } from "./backup-protocol";
import { ConnectedPlatformHttpError } from "./client";
import { signConnectedBytes } from "./payload-crypto";
import { loadBackupRuntimeIfEnrolled } from "./runtime";

const BUNDLE_FORMAT = 1 as const;
const BACKUP_ID = /^backup-[0-9]{10,17}-[0-9a-f]{16}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_CHUNKS = 512;
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

type BundleFile = Readonly<{
  index: number;
  path: string;
  sha256: string;
  byteSize: number;
}>;

type CloudBundleManifest = Readonly<{
  formatVersion: typeof BUNDLE_FORMAT;
  backupId: string;
  workspaceId: string;
  descriptorBase64: string;
  descriptorSha256: string;
  files: readonly BundleFile[];
}>;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeBundlePath(value: string): boolean {
  return value === "manifest.sfm" ||
    /^objects\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/.test(value) &&
      !value.includes("..") && !value.includes("//");
}

async function collectFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error("Cloud backup refuses symbolic links");
    if (metadata.isDirectory()) files.push(...await collectFiles(root, path));
    else if (metadata.isFile()) files.push(relative(root, path).split(sep).join("/"));
    else throw new Error("Cloud backup contains an unsupported filesystem object");
  }
  return files;
}

function parseDescriptor(bytes: Uint8Array, backupId: string, workspaceId: string) {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error("Native backup descriptor is unreadable"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Native backup descriptor is invalid");
  }
  const descriptor = value as Record<string, unknown>;
  if (
    descriptor.formatVersion !== 1 ||
    descriptor.format !== "sahelflow-survivability-backup" ||
    descriptor.backupId !== backupId ||
    descriptor.workspaceId !== workspaceId ||
    descriptor.manifestFile !== "manifest.sfm" ||
    typeof descriptor.wrappedDek !== "object" ||
    descriptor.wrappedDek === null
  ) throw new Error("Native backup descriptor authority is invalid");
  return descriptor;
}

async function nativeBundle(entry: BackupEntry, context: ServiceContext) {
  if (!context.shop) throw new Error("Cloud backup requires active shop authority");
  const location = resolve(entry.location);
  if (
    !BACKUP_ID.test(entry.backupId) || !isAbsolute(entry.location) ||
    basename(location) !== `${entry.backupId}.sfbackup`
  ) throw new Error("Native backup location authority is invalid");
  const root = await lstat(location);
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw new Error("Native backup container is not a regular directory");
  }
  const descriptorBytes = new Uint8Array(await readFile(join(location, "descriptor.json")));
  const descriptor = parseDescriptor(descriptorBytes, entry.backupId, context.shop.workspaceId);
  const paths = (await collectFiles(location))
    .filter((path) => path !== "descriptor.json")
    .sort();
  if (
    paths.length < 1 || paths.length > MAX_CHUNKS ||
    !paths.includes("manifest.sfm") || paths.some((path) => !safeBundlePath(path))
  ) throw new Error("Native backup object inventory is invalid");

  const chunks: Array<{ file: BundleFile; bytes: Uint8Array }> = [];
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index];
    if (!path) throw new Error("Native backup object inventory is incomplete");
    const bytes = new Uint8Array(await readFile(join(location, ...path.split("/"))));
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_CHUNK_BYTES) {
      throw new Error("Native backup object size is invalid");
    }
    chunks.push({
      file: { index, path, sha256: digest(bytes), byteSize: bytes.byteLength },
      bytes,
    });
  }
  const manifest: CloudBundleManifest = {
    formatVersion: BUNDLE_FORMAT,
    backupId: entry.backupId,
    workspaceId: context.shop.workspaceId,
    descriptorBase64: Buffer.from(descriptorBytes).toString("base64"),
    descriptorSha256: digest(descriptorBytes),
    files: chunks.map((chunk) => chunk.file),
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new Error("Cloud backup manifest exceeds its bounded size");
  }
  return {
    manifest,
    manifestBytes,
    chunks,
    wrappedDek: Buffer.from(JSON.stringify(descriptor.wrappedDek), "utf8").toString("base64"),
  };
}

export async function uploadNativeBackupToCloudIfEnrolled(
  context: ServiceContext,
  entry: BackupEntry,
  licenseType: "trial" | "extension" | "permanent",
): Promise<Readonly<{ backupId: string; state: "verified"; receiptDigest: string | null }> | null> {
  if (!context.shop) throw new Error("Cloud backup requires active shop authority");
  const runtime = await loadBackupRuntimeIfEnrolled(context);
  if (!runtime) return null;
  const bundle = await nativeBundle(entry, context);
  const initiated = await runtime.client.initiateBackup({
    workspaceId: context.shop.workspaceId,
    backupId: entry.backupId,
    shopId: context.shop.shopId,
    retentionClass: licenseType === "permanent" ? "pinned" : "trial",
    wrappedDek: bundle.wrappedDek,
    manifestSha256: digest(bundle.manifestBytes),
    manifestBytes: bundle.manifestBytes.byteLength,
    chunks: bundle.chunks.map(({ file }) => ({
      index: file.index,
      sha256: file.sha256,
      byteSize: file.byteSize,
    })),
  });
  if (initiated.backupId !== entry.backupId || initiated.state !== "initiated") {
    throw new Error("Cloud backup did not acknowledge the exact native backup");
  }
  await runtime.client.uploadBackupManifest(
    entry.backupId,
    context.shop.workspaceId,
    bundle.manifestBytes,
  );
  for (const chunk of bundle.chunks) {
    await runtime.client.uploadBackupChunk(
      entry.backupId,
      chunk.file.index,
      context.shop.workspaceId,
      chunk.bytes,
    );
  }
  const verifiedAt = new Date().toISOString();
  const signature = signConnectedBytes(
    runtime.desktopKeys.signingPrivateKeyPkcs8,
    canonicalBackupVerificationBytes({
      workspaceId: context.shop.workspaceId,
      shopId: context.shop.shopId,
      backupId: entry.backupId,
      manifestSha256: digest(bundle.manifestBytes),
      totalBytes: initiated.totalBytes,
      chunkCount: bundle.chunks.length,
      verifiedAt,
    }),
  );
  const verified = await runtime.client.verifyBackup(entry.backupId, {
    workspaceId: context.shop.workspaceId,
    verifiedAt,
    signature,
  });
  return Object.freeze({
    backupId: verified.backupId,
    state: verified.state,
    receiptDigest: verified.receiptDigest ?? null,
  });
}

function parseBundleManifest(bytes: Uint8Array, backupId: string, workspaceId: string): CloudBundleManifest {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error("Cloud backup bundle manifest is unreadable"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Cloud backup bundle manifest is invalid");
  }
  const row = value as Record<string, unknown>;
  if (
    row.formatVersion !== BUNDLE_FORMAT || row.backupId !== backupId ||
    row.workspaceId !== workspaceId || typeof row.descriptorBase64 !== "string" ||
    typeof row.descriptorSha256 !== "string" || !SHA256.test(row.descriptorSha256) ||
    !Array.isArray(row.files) || row.files.length < 1 || row.files.length > MAX_CHUNKS
  ) throw new Error("Cloud backup bundle manifest authority is invalid");
  const files: BundleFile[] = [];
  const paths = new Set<string>();
  for (let index = 0; index < row.files.length; index += 1) {
    const raw = row.files[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Cloud backup bundle file plan is invalid");
    }
    const file = raw as Record<string, unknown>;
    const byteSize = Number(file.byteSize);
    if (
      file.index !== index || typeof file.path !== "string" || !safeBundlePath(file.path) ||
      paths.has(file.path) || typeof file.sha256 !== "string" || !SHA256.test(file.sha256) ||
      !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_CHUNK_BYTES
    ) throw new Error("Cloud backup bundle file plan is invalid");
    paths.add(file.path);
    files.push({
      index,
      path: file.path,
      sha256: file.sha256,
      byteSize,
    });
  }
  if (!paths.has("manifest.sfm")) throw new Error("Cloud backup omits its native manifest");
  return Object.freeze({
    formatVersion: BUNDLE_FORMAT,
    backupId,
    workspaceId,
    descriptorBase64: row.descriptorBase64,
    descriptorSha256: row.descriptorSha256,
    files: Object.freeze(files),
  });
}

function backupRoot(): string {
  const base = env.backupDirectory ?? join(homedir(), "Downloads");
  if (!isAbsolute(base)) throw new Error("Backup directory authority is invalid");
  return resolve(base, "SahelFlow Backups");
}

export async function stageCloudBackupForNativeRestoreIfNeeded(
  context: ServiceContext,
  backupId: string,
): Promise<Readonly<{ staged: boolean }> | null> {
  if (!context.shop || !BACKUP_ID.test(backupId)) throw new Error("Cloud restore authority is invalid");
  const runtime = await loadBackupRuntimeIfEnrolled(context);
  if (!runtime) return null;
  const root = backupRoot();
  await mkdir(root, { recursive: true });
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("Backup root authority is invalid");
  }
  const target = join(root, `${backupId}.sfbackup`);
  try {
    const existing = await lstat(target);
    if (existing.isDirectory() && !existing.isSymbolicLink()) return Object.freeze({ staged: false });
    throw new Error("Cloud restore target is not a regular backup directory");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const plan = await runtime.client.getBackupRestorePlan(backupId, context.shop.workspaceId);
  if (plan.backupId !== backupId || plan.shopId !== context.shop.shopId) {
    throw new Error("Cloud restore plan targets another shop authority");
  }
  const manifestBytes = await runtime.client.downloadBackupManifest(
    backupId,
    context.shop.workspaceId,
    plan.manifestBytes,
    plan.manifestSha256,
  );
  const bundle = parseBundleManifest(manifestBytes, backupId, context.shop.workspaceId);
  const descriptorBytes = new Uint8Array(Buffer.from(bundle.descriptorBase64, "base64"));
  if (digest(descriptorBytes) !== bundle.descriptorSha256) {
    throw new Error("Cloud backup descriptor integrity mismatch");
  }
  const descriptor = parseDescriptor(descriptorBytes, backupId, context.shop.workspaceId);
  const expectedWrappedDek = Buffer.from(JSON.stringify(descriptor.wrappedDek), "utf8").toString("base64");
  if (plan.wrappedDek !== expectedWrappedDek || plan.chunks.length !== bundle.files.length) {
    throw new Error("Cloud restore plan disagrees with the native descriptor");
  }

  const staging = await mkdtemp(join(root, `.cloud-${backupId}-`));
  try {
    await writeFile(join(staging, "descriptor.json"), descriptorBytes, { flag: "wx", mode: 0o600 });
    for (const file of bundle.files) {
      const remote = plan.chunks.find((chunk) => chunk.chunk_index === file.index);
      if (!remote || remote.sha256 !== file.sha256 || remote.byte_size !== file.byteSize) {
        throw new Error("Cloud chunk plan disagrees with the signed bundle manifest");
      }
      const bytes = await runtime.client.downloadBackupChunk(
        backupId,
        file.index,
        context.shop.workspaceId,
        file.byteSize,
        file.sha256,
      );
      const destination = join(staging, ...file.path.split("/"));
      if (!resolve(destination).startsWith(`${resolve(staging)}${sep}`)) {
        throw new Error("Cloud backup path escaped its staging authority");
      }
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
    }
    await rename(staging, target);
  } catch (error) {
    if (resolve(staging).startsWith(`${resolve(root)}${sep}`)) {
      await rm(staging, { recursive: true, force: true });
    }
    throw error;
  }
  return Object.freeze({ staged: true });
}

export async function deleteCloudBackupIfEnrolled(
  context: ServiceContext,
  backupId: string,
): Promise<boolean> {
  if (!context.shop || !BACKUP_ID.test(backupId)) throw new Error("Cloud delete authority is invalid");
  const runtime = await loadBackupRuntimeIfEnrolled(context);
  if (!runtime) return false;
  let deleted;
  try {
    deleted = await runtime.client.deleteRemoteBackup(backupId, context.shop.workspaceId);
  } catch (error) {
    if (error instanceof ConnectedPlatformHttpError && error.status === 404) return false;
    throw error;
  }
  if (deleted.backupId !== backupId || deleted.state !== "deleted") {
    throw new Error("Cloud backup deletion was not acknowledged");
  }
  return true;
}

export async function listCloudBackupsIfEnrolled(
  context: ServiceContext,
): Promise<readonly BackupEntry[]> {
  const shop = context.shop;
  if (!shop) throw new Error("Cloud backup list requires active shop authority");
  const runtime = await loadBackupRuntimeIfEnrolled(context);
  if (!runtime) return Object.freeze([]);
  const result = await runtime.client.listBackups(shop.workspaceId, 100);
  return Object.freeze(result.backups
    .filter((backup) =>
      BACKUP_ID.test(backup.backup_id) &&
      backup.shop_id === shop.shopId &&
      backup.state === "verified" &&
      Number.isSafeInteger(backup.total_bytes) && backup.total_bytes > 0 &&
      Number.isFinite(Date.parse(backup.created_at)) &&
      (backup.verified_at === null || Number.isFinite(Date.parse(backup.verified_at))),
    )
    .map((backup): BackupEntry => {
      const createdAt = Date.parse(backup.created_at);
      const verifiedAt = backup.verified_at ? Date.parse(backup.verified_at) : createdAt;
      return {
        backupId: backup.backup_id,
        createdAtUnixMs: createdAt,
        verifiedAtUnixMs: verifiedAt,
        retentionClass: backup.retention_class,
        pinned: backup.retention_class === "pinned",
        workspaceId: shop.workspaceId,
        sourceInstallationId: "cloud-encrypted",
        shopCount: 1,
        plaintextBytes: 0,
        containerBytes: backup.total_bytes,
        status: "verified",
        location: "cloud",
        requiresRecoveryKit: true,
        independentRecoveryReady: false,
        filename: backup.backup_id,
        size: backup.total_bytes,
        createdAt: new Date(createdAt).toISOString(),
        shopId: backup.shop_id,
        sha256: backup.manifest_sha256,
      };
    }));
}
