import { createHmac, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";
import type { ShopContext } from "@/lib/shops/context";
import { dataRoot } from "@/lib/storage/data-root";
import {
  ensureConnectedInstallationAuthority,
  rotateConnectedInstallationAuthorityProtection,
} from "./installation-authority";

const LEGACY_HMAC_DOMAIN = "sahelflow:connected-installation-authority:v1";
const LEGACY_FILE = "connected-installation-authority-v1.json";
const CURRENT_FILE = "connected-installation-authority-v2.json";
const LOCK_FILE = "connected-installation-authority-v2.lock";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "a".repeat(32),
  installationId: "b".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "c".repeat(32),
  registryRevision: 1,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "d".repeat(64),
});

const SIGNING_PRIVATE = `signing-private-${"s".repeat(80)}`;
const ENCRYPTION_PRIVATE = `encryption-private-${"e".repeat(160)}`;
const CONTROL_TOKEN = `control-${"c".repeat(64)}`;
const BACKUP_TOKEN = `backup-${"b".repeat(64)}`;

const DESKTOP_KEYS = Object.freeze({
  signingPublicKey: `signing-public-${"p".repeat(48)}`,
  signingPrivateKeyPkcs8: SIGNING_PRIVATE,
  encryptionPublicKeyJwk: JSON.stringify({
    kty: "RSA",
    n: "n".repeat(96),
    e: "AQAB",
  }),
  encryptionPrivateKeyPkcs8: ENCRYPTION_PRIVATE,
});

function systemDirectory(): string {
  return join(dataRoot(), "system");
}

function authorityPath(file: string): string {
  return join(systemDirectory(), file);
}

function cleanupAuthority(): void {
  for (const file of [LEGACY_FILE, CURRENT_FILE, LOCK_FILE]) {
    rmSync(authorityPath(file), { force: true });
  }
}

function configuredRoot(): Buffer {
  const value = process.env.SF_MASTER_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(
      "SF_MASTER_KEY must be configured for connected authority tests",
    );
  }
  return Buffer.from(value, "hex");
}

function context(): ServiceContext {
  return {
    shop: SHOP,
    // Existing-authority migration and reads never touch Prisma. Keep the test
    // focused on installation-wide filesystem authority instead of a shop DB.
    prisma: {} as ServiceContext["prisma"],
  };
}

function legacyUnsigned() {
  return {
    formatVersion: 1 as const,
    workspaceId: SHOP.workspaceId,
    installationId: SHOP.installationId,
    desktopKeys: DESKTOP_KEYS,
    controlToken: CONTROL_TOKEN,
    backupToken: BACKUP_TOKEN,
    revision: 7,
    updatedAt: "2026-08-24T12:00:00.000Z",
  };
}

function writeLegacy(root: Buffer): void {
  mkdirSync(systemDirectory(), { recursive: true });
  const unsigned = legacyUnsigned();
  const hmac = createHmac("sha256", root)
    .update(LEGACY_HMAC_DOMAIN)
    .update("\0")
    .update(JSON.stringify(unsigned))
    .digest("hex");
  writeFileSync(
    authorityPath(LEGACY_FILE),
    `${JSON.stringify({ ...unsigned, hmac })}\n`,
    "utf8",
  );
}

beforeEach(cleanupAuthority);
afterEach(cleanupAuthority);

describe("connected installation authority protection", () => {
  it("migrates authenticated v1 plaintext authority to v2 AEAD without leaking secrets", async () => {
    writeLegacy(configuredRoot());

    const migrated = await ensureConnectedInstallationAuthority(context());
    expect(migrated).toMatchObject({
      workspaceId: SHOP.workspaceId,
      installationId: SHOP.installationId,
      desktopKeys: DESKTOP_KEYS,
      controlToken: CONTROL_TOKEN,
      backupToken: BACKUP_TOKEN,
      revision: 7,
    });

    expect(existsSync(authorityPath(LEGACY_FILE))).toBe(false);
    expect(existsSync(authorityPath(CURRENT_FILE))).toBe(true);

    const raw = readFileSync(authorityPath(CURRENT_FILE), "utf8");
    for (const secret of [
      SIGNING_PRIVATE,
      ENCRYPTION_PRIVATE,
      CONTROL_TOKEN,
      BACKUP_TOKEN,
    ]) {
      expect(raw).not.toContain(secret);
    }
    const stored = JSON.parse(raw) as Record<string, unknown>;
    expect(stored).toMatchObject({
      formatVersion: 2,
      algorithm: "aes-256-gcm",
      keyVersion: 1,
      workspaceId: SHOP.workspaceId,
      installationId: SHOP.installationId,
      revision: 7,
    });
    expect(stored).not.toHaveProperty("desktopKeys");
    expect(stored).not.toHaveProperty("controlToken");
    expect(stored).not.toHaveProperty("backupToken");
    expect(stored.keyId).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.iv).toEqual(expect.any(String));
    expect(stored.ciphertext).toEqual(expect.any(String));
    expect(stored.tag).toEqual(expect.any(String));

    await expect(
      ensureConnectedInstallationAuthority(context()),
    ).resolves.toEqual(migrated);
  });

  it("fails closed when v2 ciphertext is modified", async () => {
    writeLegacy(configuredRoot());
    await ensureConnectedInstallationAuthority(context());

    const path = authorityPath(CURRENT_FILE);
    const stored = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      unknown
    >;
    const ciphertext = Buffer.from(String(stored.ciphertext), "base64");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 0x01;
    stored.ciphertext = ciphertext.toString("base64");
    writeFileSync(path, `${JSON.stringify(stored)}\n`, "utf8");

    await expect(
      ensureConnectedInstallationAuthority(context()),
    ).rejects.toThrow("Connected installation authority authentication failed");
  });

  it("rewraps authority protection with installation-root rotation and resumes idempotently", async () => {
    const oldRoot = configuredRoot();
    const newRoot = randomBytes(32);
    writeLegacy(oldRoot);

    await expect(
      rotateConnectedInstallationAuthorityProtection(oldRoot, newRoot),
    ).resolves.toBe("rotated");
    expect(existsSync(authorityPath(LEGACY_FILE))).toBe(false);
    expect(existsSync(authorityPath(CURRENT_FILE))).toBe(true);

    await expect(
      rotateConnectedInstallationAuthorityProtection(oldRoot, newRoot),
    ).resolves.toBe("already-current");

    await expect(
      rotateConnectedInstallationAuthorityProtection(newRoot, oldRoot),
    ).resolves.toBe("rotated");
    await expect(
      ensureConnectedInstallationAuthority(context()),
    ).resolves.toMatchObject({
      desktopKeys: DESKTOP_KEYS,
      controlToken: CONTROL_TOKEN,
      backupToken: BACKUP_TOKEN,
      revision: 7,
    });

    oldRoot.fill(0);
    newRoot.fill(0);
  });
});
