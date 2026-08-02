import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";

import { getMasterKey } from "@/lib/crypto/master-key";
import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";

const ARCHIVE_KEY_DOMAIN = Buffer.from(
  "sahelflow.shop-archive.key.v1",
  "utf8",
);
const ARCHIVE_MAC_DOMAIN = Buffer.from("sahelflow.shop-archive.v1", "utf8");
const ARCHIVE_DIRECTORY = "shop-archives";
const MANIFEST_FILE = "manifest.json";
const MAX_MANIFEST_BYTES = 128 * 1024;

const exactId = z.string().regex(/^[0-9a-f]{32}$/);
const shopId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const databaseFile = z.string().regex(/^[a-z0-9][a-z0-9-]*\.db$/);

const shopSchema = z
  .object({
    id: shopId,
    incarnationId: exactId,
    name: z.string().min(1).max(200),
    databaseFile,
    icon: z.string().max(32).nullable(),
    createdAt: z.string().min(1).max(64),
  })
  .strict();

const archiveStateSchema = z
  .object({
    formatVersion: z.literal(1),
    archiveId: exactId,
    workspaceId: exactId,
    installationId: exactId,
    status: z.enum(["archived", "deleted-rescue"]),
    shop: shopSchema,
    databaseSha256: z.string().regex(/^[0-9a-f]{64}$/),
    archivedAtUnixMs: z.number().int().positive().safe(),
    sourceRegistryRevision: z.number().int().positive().safe(),
    operationId: exactId,
  })
  .strict();

const archiveEnvelopeSchema = z
  .object({
    formatVersion: z.literal(1),
    keyId: z.literal("installation-root-shop-archive-hmac-v1"),
    state: archiveStateSchema,
    mac: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type NativeShopArchive = Readonly<z.infer<typeof archiveStateSchema>>;

class FrameWriter {
  private readonly chunks: Buffer[] = [];

  u8(value: number): void {
    const output = Buffer.allocUnsafe(1);
    output.writeUInt8(value);
    this.chunks.push(output);
  }

  u64(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw archiveError("Archive manifest contains an invalid integer");
    }
    const output = Buffer.allocUnsafe(8);
    output.writeBigUInt64BE(BigInt(value));
    this.chunks.push(output);
  }

  string(value: string): void {
    const encoded = Buffer.from(value, "utf8");
    this.u64(encoded.length);
    this.chunks.push(encoded);
  }

  optionalString(value: string | null): void {
    if (value === null) {
      this.u8(0);
      return;
    }
    this.u8(1);
    this.string(value);
  }

  finish(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function archiveError(
  message: string,
  code = "SHOP_ARCHIVE_AUTHORITY_UNAVAILABLE",
  statusCode = 503,
): SahelFlowError {
  return new SahelFlowError(message, code, statusCode);
}

function archiveKey(): Buffer {
  const root = getMasterKey();
  if (root.length !== 32) {
    throw archiveError("Installation root key is not 256-bit");
  }
  return createHmac("sha256", root).update(ARCHIVE_KEY_DOMAIN).digest();
}

function archiveMessage(state: NativeShopArchive): Buffer {
  const writer = new FrameWriter();
  writer.string(ARCHIVE_MAC_DOMAIN.toString("utf8"));
  writer.u8(0);
  writer.u8(state.formatVersion);
  writer.string(state.archiveId);
  writer.string(state.workspaceId);
  writer.string(state.installationId);
  writer.u8(state.status === "archived" ? 1 : 2);
  writer.string(state.shop.id);
  writer.string(state.shop.incarnationId);
  writer.string(state.shop.name);
  writer.string(state.shop.databaseFile);
  writer.optionalString(state.shop.icon);
  writer.string(state.shop.createdAt);
  writer.string(state.databaseSha256);
  writer.u64(state.archivedAtUnixMs);
  writer.u64(state.sourceRegistryRevision);
  writer.string(state.operationId);
  return writer.finish();
}

function verifyArchiveEnvelope(input: unknown): NativeShopArchive {
  const envelope = archiveEnvelopeSchema.parse(input);
  const key = archiveKey();
  try {
    const expected = createHmac("sha256", key)
      .update(archiveMessage(envelope.state))
      .digest();
    const supplied = Buffer.from(envelope.mac, "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw archiveError("Shop archive manifest authentication failed");
    }
  } finally {
    key.fill(0);
  }
  return Object.freeze(envelope.state);
}

function archiveRoot(): string {
  const root = dataRoot();
  if (!isAbsolute(root)) {
    throw archiveError("Shop archive data root is not absolute");
  }
  return resolve(root, ARCHIVE_DIRECTORY);
}

function safeManifestPath(archiveId: string): string {
  exactId.parse(archiveId);
  const root = archiveRoot();
  const manifest = join(root, archiveId, MANIFEST_FILE);
  const canonicalRoot = realpathSync(root);
  const canonicalManifest = realpathSync(manifest);
  const pathFromRoot = relative(canonicalRoot, canonicalManifest);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw archiveError("Shop archive manifest escaped the canonical archive root");
  }
  const metadata = lstatSync(canonicalManifest);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw archiveError("Shop archive manifest is not a contained regular file");
  }
  if (metadata.size === 0 || metadata.size > MAX_MANIFEST_BYTES) {
    throw archiveError("Shop archive manifest exceeds its bounded size");
  }
  return canonicalManifest;
}

export function getNativeShopArchive(archiveId: string): NativeShopArchive {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(safeManifestPath(archiveId), "utf8"));
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw archiveError("Shop archive manifest is missing or unreadable", "SHOP_ARCHIVE_NOT_FOUND", 404);
  }
  const archive = verifyArchiveEnvelope(input);
  if (archive.archiveId !== archiveId) {
    throw archiveError("Shop archive identity does not match its directory");
  }
  return archive;
}

export function listNativeShopArchives(): readonly NativeShopArchive[] {
  const root = archiveRoot();
  let entries: string[];
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[0-9a-f]{32}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return Object.freeze([]);
  }

  const archives = entries
    .map((archiveId) => {
      try {
        return getNativeShopArchive(archiveId);
      } catch {
        return null;
      }
    })
    .filter((archive): archive is NativeShopArchive => archive !== null)
    .sort((left, right) => right.archivedAtUnixMs - left.archivedAtUnixMs);
  return Object.freeze(archives);
}
