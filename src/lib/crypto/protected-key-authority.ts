import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  deriveInstallationKey,
  type InstallationKeyPurpose,
} from "@/lib/crypto/key-hierarchy";
import { getMasterKey } from "@/lib/crypto/master-key";
import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";
import {
  createProtectedValueKeyDescriptor,
  openProtectedString,
  sealProtectedString,
  type ProtectedValueKeyDescriptor,
  type ShopKeyAuthorityBinding,
  type ShopProtectedKeyPurpose,
} from "@/lib/crypto/protected-value";
import {
  processShopContext,
  type ShopContext,
} from "@/lib/shops/context";

const AUTHORITY_FORMAT_VERSION = 1 as const;
const AUTHORITY_ALGORITHM = "sahelflow-protected-value/aes-256-gcm" as const;
const KEY_BYTES = 32;
const DEFAULT_KEY_VERSION = 1;
const TEST_ROOT_DOMAIN = Buffer.from(
  "sahelflow.test-installation-root.v1\0",
  "utf8",
);

const INSTALLATION_PURPOSE: Record<
  ShopProtectedKeyPurpose,
  InstallationKeyPurpose
> = {
  "shop-data": "shop-data-key-wrap",
  "shop-blind-index": "shop-blind-index-key-wrap",
  "shop-secret": "secret-store-key-wrap",
};

interface ProtectedKeyAuthorityRow {
  purpose: string;
  formatVersion: number;
  algorithm: string;
  keyVersion: number;
  keyId: string;
  wrappingKeyId: string;
  wrappedKey: string;
}

type ProtectedKeyAuthorityClient = Pick<PrismaClient, "protectedKeyAuthority">;

export interface ResolvedShopProtectedKey {
  purpose: ShopProtectedKeyPurpose;
  descriptor: ProtectedValueKeyDescriptor;
  key: Buffer;
  wrappingKeyId: string;
}

export interface ResolveShopProtectedKeyOptions {
  shopContext?: ShopContext;
  installationRoot?: Buffer;
  keyVersion?: number;
  /** Set false for read-only verification paths. */
  createIfMissing?: boolean;
}

export interface ProtectedKeyRewrapStats {
  total: number;
  rewrapped: number;
  alreadyCurrent: number;
}

function keyAuthorityError(
  failure: "format" | "key" | "context" | "authentication",
  message: string,
  cause?: unknown,
): ProtectedDataCorruptionError {
  return new ProtectedDataCorruptionError(failure, message, cause);
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function assertKeyVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new TypeError("Protected shop key version must be a positive integer");
  }
}

function isShopProtectedKeyPurpose(
  value: string,
): value is ShopProtectedKeyPurpose {
  return Object.prototype.hasOwnProperty.call(INSTALLATION_PURPOSE, value);
}

function defaultInstallationRoot(): Buffer {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return createHash("sha256")
      .update(TEST_ROOT_DOMAIN)
      .update(process.env.SF_TEST_ROOT ?? "default", "utf8")
      .digest();
  }
  return getMasterKey();
}

function binding(
  context: ShopContext,
  purpose: ShopProtectedKeyPurpose,
  keyVersion: number,
): ShopKeyAuthorityBinding {
  return {
    scope: "shop-key-authority",
    workspaceId: context.workspaceId,
    installationId: context.installationId,
    shopId: context.shopId,
    shopIncarnationId: context.shopIncarnationId,
    protectedPurpose: purpose,
    protectedVersion: keyVersion,
  };
}

function wrappingAuthority(
  context: ShopContext,
  purpose: ShopProtectedKeyPurpose,
  installationRoot: Buffer,
) {
  const derived = deriveInstallationKey(installationRoot, {
    workspaceId: context.workspaceId,
    installationId: context.installationId,
    purpose: INSTALLATION_PURPOSE[purpose],
    version: 1,
  });
  return {
    ...derived,
    envelopeDescriptor: createProtectedValueKeyDescriptor(
      derived.key,
      "key-wrap",
      1,
    ),
  };
}

function decodeKeyHex(value: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw keyAuthorityError(
      "format",
      "Wrapped protected shop key has an invalid plaintext format",
    );
  }
  const key = Buffer.from(value, "hex");
  if (key.length !== KEY_BYTES) {
    key.fill(0);
    throw keyAuthorityError(
      "format",
      "Wrapped protected shop key has an invalid length",
    );
  }
  return key;
}

function validateRow(
  row: ProtectedKeyAuthorityRow,
  purpose: ShopProtectedKeyPurpose,
  keyVersion: number,
  wrappingKeyId: string,
): void {
  if (
    row.purpose !== purpose ||
    row.formatVersion !== AUTHORITY_FORMAT_VERSION ||
    row.algorithm !== AUTHORITY_ALGORITHM ||
    row.keyVersion !== keyVersion ||
    !/^[0-9a-f]{64}$/.test(row.keyId) ||
    typeof row.wrappedKey !== "string" ||
    row.wrappedKey.length === 0
  ) {
    throw keyAuthorityError(
      "format",
      `Protected key authority for ${purpose} is unsupported or malformed`,
    );
  }
  if (row.wrappingKeyId !== wrappingKeyId) {
    throw keyAuthorityError(
      "key",
      `Protected key authority for ${purpose} belongs to another installation wrapping key`,
    );
  }
}

function openAuthorityRow(
  row: ProtectedKeyAuthorityRow,
  context: ShopContext,
  purpose: ShopProtectedKeyPurpose,
  keyVersion: number,
  installationRoot: Buffer,
): ResolvedShopProtectedKey {
  const wrapping = wrappingAuthority(context, purpose, installationRoot);
  validateRow(row, purpose, keyVersion, wrapping.descriptor.keyId);

  const key = decodeKeyHex(
    openProtectedString(
      row.wrappedKey,
      wrapping.key,
      wrapping.envelopeDescriptor,
      binding(context, purpose, keyVersion),
    ),
  );
  const descriptor = createProtectedValueKeyDescriptor(
    key,
    purpose,
    keyVersion,
  );
  if (descriptor.keyId !== row.keyId) {
    key.fill(0);
    throw keyAuthorityError(
      "key",
      `Protected key authority for ${purpose} does not match its key ID`,
    );
  }

  return {
    purpose,
    descriptor,
    key,
    wrappingKeyId: wrapping.descriptor.keyId,
  };
}

async function readAuthorityRow(
  prisma: ProtectedKeyAuthorityClient,
  purpose: ShopProtectedKeyPurpose,
): Promise<ProtectedKeyAuthorityRow | null> {
  return prisma.protectedKeyAuthority.findUnique({
    where: { purpose },
    select: {
      purpose: true,
      formatVersion: true,
      algorithm: true,
      keyVersion: true,
      keyId: true,
      wrappingKeyId: true,
      wrappedKey: true,
    },
  });
}

/**
 * Resolve or create one purpose-specific random shop key.
 *
 * The installation root is used only to derive the local wrapping key. The
 * returned random key encrypts seller fields/secrets and remains stable across
 * installation-root rotation. Concurrent first use is safe through the unique
 * purpose primary key: one writer wins and all losers read the authenticated
 * winner.
 */
export async function resolveShopProtectedKey(
  prisma: ProtectedKeyAuthorityClient,
  purpose: ShopProtectedKeyPurpose,
  options: ResolveShopProtectedKeyOptions = {},
): Promise<ResolvedShopProtectedKey> {
  const context = options.shopContext ?? processShopContext();
  const installationRoot =
    options.installationRoot ?? defaultInstallationRoot();
  const keyVersion = options.keyVersion ?? DEFAULT_KEY_VERSION;
  const createIfMissing = options.createIfMissing ?? true;
  assertKeyVersion(keyVersion);

  const existing = await readAuthorityRow(prisma, purpose);
  if (existing) {
    return openAuthorityRow(
      existing,
      context,
      purpose,
      keyVersion,
      installationRoot,
    );
  }
  if (!createIfMissing) {
    throw keyAuthorityError(
      "format",
      `Protected key authority for ${purpose} is missing`,
    );
  }

  const generated = randomBytes(KEY_BYTES);
  const descriptor = createProtectedValueKeyDescriptor(
    generated,
    purpose,
    keyVersion,
  );
  const wrapping = wrappingAuthority(context, purpose, installationRoot);
  const wrappedKey = sealProtectedString(
    generated.toString("hex"),
    wrapping.key,
    wrapping.envelopeDescriptor,
    binding(context, purpose, keyVersion),
  );

  try {
    await prisma.protectedKeyAuthority.create({
      data: {
        purpose,
        formatVersion: AUTHORITY_FORMAT_VERSION,
        algorithm: AUTHORITY_ALGORITHM,
        keyVersion,
        keyId: descriptor.keyId,
        wrappingKeyId: wrapping.descriptor.keyId,
        wrappedKey,
      },
    });
    return {
      purpose,
      descriptor,
      key: generated,
      wrappingKeyId: wrapping.descriptor.keyId,
    };
  } catch (error) {
    generated.fill(0);
    if (!isUniqueConstraintError(error)) throw error;
    const winner = await readAuthorityRow(prisma, purpose);
    if (!winner) {
      throw keyAuthorityError(
        "format",
        `Concurrent protected key creation for ${purpose} completed without a winner`,
      );
    }
    return openAuthorityRow(
      winner,
      context,
      purpose,
      keyVersion,
      installationRoot,
    );
  }
}

/**
 * Re-wrap every existing random shop key under a new installation root without
 * changing the shop key or any seller ciphertext. The operation is idempotent:
 * rows already authenticated under the new root are verified and skipped.
 */
export async function rewrapShopProtectedKeys(
  prisma: ProtectedKeyAuthorityClient,
  context: ShopContext,
  oldInstallationRoot: Buffer,
  newInstallationRoot: Buffer,
  dryRun = false,
): Promise<ProtectedKeyRewrapStats> {
  const rows = await prisma.protectedKeyAuthority.findMany({
    select: {
      purpose: true,
      formatVersion: true,
      algorithm: true,
      keyVersion: true,
      keyId: true,
      wrappingKeyId: true,
      wrappedKey: true,
    },
  });
  const stats: ProtectedKeyRewrapStats = {
    total: rows.length,
    rewrapped: 0,
    alreadyCurrent: 0,
  };

  for (const row of rows) {
    if (!isShopProtectedKeyPurpose(row.purpose)) {
      throw keyAuthorityError(
        "format",
        `Protected key authority has unsupported purpose ${row.purpose}`,
      );
    }
    assertKeyVersion(row.keyVersion);
    const oldWrapping = wrappingAuthority(
      context,
      row.purpose,
      oldInstallationRoot,
    );
    const newWrapping = wrappingAuthority(
      context,
      row.purpose,
      newInstallationRoot,
    );

    if (row.wrappingKeyId === newWrapping.descriptor.keyId) {
      const current = openAuthorityRow(
        row,
        context,
        row.purpose,
        row.keyVersion,
        newInstallationRoot,
      );
      current.key.fill(0);
      stats.alreadyCurrent += 1;
      continue;
    }
    if (row.wrappingKeyId !== oldWrapping.descriptor.keyId) {
      throw keyAuthorityError(
        "key",
        `Protected key authority for ${row.purpose} matches neither the current nor candidate installation root`,
      );
    }

    const current = openAuthorityRow(
      row,
      context,
      row.purpose,
      row.keyVersion,
      oldInstallationRoot,
    );
    try {
      const wrappedKey = sealProtectedString(
        current.key.toString("hex"),
        newWrapping.key,
        newWrapping.envelopeDescriptor,
        binding(context, row.purpose, row.keyVersion),
      );
      if (!dryRun) {
        await prisma.protectedKeyAuthority.update({
          where: { purpose: row.purpose },
          data: {
            wrappingKeyId: newWrapping.descriptor.keyId,
            wrappedKey,
          },
        });
      }
      stats.rewrapped += 1;
    } finally {
      current.key.fill(0);
    }
  }

  return stats;
}
