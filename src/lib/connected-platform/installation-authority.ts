import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getMasterKey } from "@/lib/crypto/master-key";
import type { ServiceContext } from "@/lib/data/service-base";
import { getSecret } from "@/lib/secrets";
import { dataRoot } from "@/lib/storage/data-root";
import { generateConnectedKeyPair } from "./payload-crypto";

export const LEGACY_CONNECTED_CONTROL_TOKEN_SECRET = "connected_control_token";
export const LEGACY_CONNECTED_BACKUP_TOKEN_SECRET = "connected_backup_token";
export const LEGACY_CONNECTED_DESKTOP_KEYS_SECRET = "connected_desktop_keys_v1";

const FORMAT_VERSION = 1 as const;
const FILE_NAME = "connected-installation-authority-v1.json";
const LOCK_NAME = "connected-installation-authority-v1.lock";
const HMAC_DOMAIN = "sahelflow:connected-installation-authority:v1";
const HEX32 = /^[0-9a-f]{32}$/i;

type ConnectedDesktopKeys = Readonly<{
  signingPublicKey: string;
  signingPrivateKeyPkcs8: string;
  encryptionPublicKeyJwk: string;
  encryptionPrivateKeyPkcs8: string;
}>;

export type ConnectedInstallationAuthority = Readonly<{
  workspaceId: string;
  installationId: string;
  desktopKeys: ConnectedDesktopKeys;
  controlToken: string | null;
  backupToken: string | null;
  revision: number;
}>;

type StoredAuthority = {
  formatVersion: typeof FORMAT_VERSION;
  workspaceId: string;
  installationId: string;
  desktopKeys: ConnectedDesktopKeys;
  controlToken: string | null;
  backupToken: string | null;
  revision: number;
  updatedAt: string;
  hmac: string;
};

function authorityPath(): string {
  return join(dataRoot(), "system", FILE_NAME);
}

function lockPath(): string {
  return join(dataRoot(), "system", LOCK_NAME);
}

function canonicalPayload(value: Omit<StoredAuthority, "hmac">): string {
  return JSON.stringify({
    formatVersion: value.formatVersion,
    workspaceId: value.workspaceId,
    installationId: value.installationId,
    desktopKeys: {
      signingPublicKey: value.desktopKeys.signingPublicKey,
      signingPrivateKeyPkcs8: value.desktopKeys.signingPrivateKeyPkcs8,
      encryptionPublicKeyJwk: value.desktopKeys.encryptionPublicKeyJwk,
      encryptionPrivateKeyPkcs8: value.desktopKeys.encryptionPrivateKeyPkcs8,
    },
    controlToken: value.controlToken,
    backupToken: value.backupToken,
    revision: value.revision,
    updatedAt: value.updatedAt,
  });
}

function sign(value: Omit<StoredAuthority, "hmac">): string {
  return createHmac("sha256", getMasterKey())
    .update(HMAC_DOMAIN)
    .update("\0")
    .update(canonicalPayload(value))
    .digest("hex");
}

function validKey(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function parseDesktopKeys(value: unknown): ConnectedDesktopKeys | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !validKey(row.signingPublicKey, 32, 512) ||
    !validKey(row.signingPrivateKeyPkcs8, 32, 16_384) ||
    !validKey(row.encryptionPublicKeyJwk, 32, 4_096) ||
    !validKey(row.encryptionPrivateKeyPkcs8, 32, 16_384)
  ) return null;
  return Object.freeze({
    signingPublicKey: row.signingPublicKey,
    signingPrivateKeyPkcs8: row.signingPrivateKeyPkcs8,
    encryptionPublicKeyJwk: row.encryptionPublicKeyJwk,
    encryptionPrivateKeyPkcs8: row.encryptionPrivateKeyPkcs8,
  });
}

function parseStored(raw: string): StoredAuthority {
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch { throw new Error("Connected installation authority is unreadable"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Connected installation authority is invalid");
  }
  const row = parsed as Record<string, unknown>;
  const desktopKeys = parseDesktopKeys(row.desktopKeys);
  if (
    row.formatVersion !== FORMAT_VERSION ||
    !HEX32.test(String(row.workspaceId ?? "")) ||
    !HEX32.test(String(row.installationId ?? "")) ||
    !desktopKeys ||
    !(row.controlToken === null || validKey(row.controlToken, 32, 256)) ||
    !(row.backupToken === null || validKey(row.backupToken, 32, 256)) ||
    !Number.isSafeInteger(row.revision) || Number(row.revision) < 1 ||
    typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt)) ||
    typeof row.hmac !== "string" || !/^[0-9a-f]{64}$/.test(row.hmac)
  ) throw new Error("Connected installation authority is invalid");

  const unsigned: Omit<StoredAuthority, "hmac"> = {
    formatVersion: FORMAT_VERSION,
    workspaceId: String(row.workspaceId),
    installationId: String(row.installationId),
    desktopKeys,
    controlToken: row.controlToken as string | null,
    backupToken: row.backupToken as string | null,
    revision: Number(row.revision),
    updatedAt: row.updatedAt,
  };
  const expected = Buffer.from(sign(unsigned), "hex");
  const actual = Buffer.from(row.hmac, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Connected installation authority authentication failed");
  }
  return { ...unsigned, hmac: row.hmac };
}

function snapshot(value: StoredAuthority): ConnectedInstallationAuthority {
  return Object.freeze({
    workspaceId: value.workspaceId,
    installationId: value.installationId,
    desktopKeys: value.desktopKeys,
    controlToken: value.controlToken,
    backupToken: value.backupToken,
    revision: value.revision,
  });
}

async function readStored(): Promise<StoredAuthority | null> {
  try { return parseStored(await readFile(authorityPath(), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function persist(value: Omit<StoredAuthority, "hmac">): Promise<StoredAuthority> {
  const path = authorityPath();
  await mkdir(dirname(path), { recursive: true });
  const stored: StoredAuthority = { ...value, hmac: sign(value) };
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(stored)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temp, path);
  return stored;
}

async function withAuthorityLock<T>(operation: () => Promise<T>): Promise<T> {
  const path = lockPath();
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 250; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      try { return await operation(); }
      finally {
        await handle.close();
        await rm(path, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("Connected installation authority is busy");
}

async function legacyKeys(context: ServiceContext): Promise<ConnectedDesktopKeys | null> {
  const value = await getSecret(context, LEGACY_CONNECTED_DESKTOP_KEYS_SECRET);
  if (!value) return null;
  try { return parseDesktopKeys(JSON.parse(value) as unknown); }
  catch { return null; }
}

function assertScope(context: ServiceContext, value: StoredAuthority): void {
  const shop = context.shop;
  if (!shop || value.workspaceId !== shop.workspaceId || value.installationId !== shop.installationId) {
    throw new Error("Connected installation authority belongs to another installation");
  }
}

export async function ensureConnectedInstallationAuthority(
  context: ServiceContext,
): Promise<ConnectedInstallationAuthority> {
  if (!context.shop) throw new Error("Connected installation authority requires trusted shop context");
  return withAuthorityLock(async () => {
    const existing = await readStored();
    if (existing) {
      assertScope(context, existing);
      return snapshot(existing);
    }
    const migratedKeys = await legacyKeys(context);
    const keys = migratedKeys ?? generateConnectedKeyPair();
    const [controlToken, backupToken] = await Promise.all([
      getSecret(context, LEGACY_CONNECTED_CONTROL_TOKEN_SECRET),
      getSecret(context, LEGACY_CONNECTED_BACKUP_TOKEN_SECRET),
    ]);
    const stored = await persist({
      formatVersion: FORMAT_VERSION,
      workspaceId: context.shop.workspaceId,
      installationId: context.shop.installationId,
      desktopKeys: keys,
      controlToken,
      backupToken,
      revision: 1,
      updatedAt: new Date().toISOString(),
    });
    return snapshot(stored);
  });
}

export async function updateConnectedInstallationTokens(
  context: ServiceContext,
  update: Readonly<{ controlToken?: string | null; backupToken?: string | null }>,
): Promise<ConnectedInstallationAuthority> {
  if (!context.shop) throw new Error("Connected installation authority requires trusted shop context");
  return withAuthorityLock(async () => {
    const current = await readStored();
    if (!current) throw new Error("Connected installation authority is not initialized");
    assertScope(context, current);
    const controlToken = update.controlToken === undefined ? current.controlToken : update.controlToken;
    const backupToken = update.backupToken === undefined ? current.backupToken : update.backupToken;
    if (!(controlToken === null || validKey(controlToken, 32, 256)) ||
        !(backupToken === null || validKey(backupToken, 32, 256))) {
      throw new Error("Connected installation token authority is invalid");
    }
    const stored = await persist({
      formatVersion: FORMAT_VERSION,
      workspaceId: current.workspaceId,
      installationId: current.installationId,
      desktopKeys: current.desktopKeys,
      controlToken,
      backupToken,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    return snapshot(stored);
  });
}
