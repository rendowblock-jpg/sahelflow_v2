import "server-only";

import type { PrismaClient } from "@prisma/client";

import {
  decryptString,
  deriveBlindIndex,
  isEncryptedPayload,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";
import {
  deriveShopBlindIndex,
  openShopRecordField,
  type ProtectedRecordReference,
} from "@/lib/crypto/protected-record";
import { classifyProtectedValue } from "@/lib/crypto/protected-value-classification";
import type { ShopContext } from "@/lib/shops/context";

export const PHONE_REPUTATION_MIGRATION_MARKER =
  "__sahelflow_internal_phase4_phone_reputation_blind_index_v1";
const PHONE_REPUTATION_MIGRATION_COMPLETE = "canonical-shop-blind-index-v1";

export interface PhoneReputationProtectedMigrationOptions {
  mode: "verify" | "apply";
  shopContext: ShopContext;
  installationRoot: Buffer;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim().toLowerCase();
}

function legacyPayload(value: string): EncryptedPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new ProtectedDataCorruptionError(
      "format",
      "Legacy phone source is malformed",
      cause,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProtectedDataCorruptionError(
      "format",
      "Legacy phone source is not an object",
    );
  }
  const payload = parsed as Partial<EncryptedPayload>;
  if (
    typeof payload.iv !== "string" ||
    typeof payload.ciphertext !== "string" ||
    typeof payload.tag !== "string"
  ) {
    throw new ProtectedDataCorruptionError(
      "format",
      "Legacy phone source has missing fields",
    );
  }
  return {
    iv: payload.iv,
    ciphertext: payload.ciphertext,
    tag: payload.tag,
  };
}

async function openPhoneSource(
  prisma: PrismaClient,
  value: string,
  reference: ProtectedRecordReference,
  options: PhoneReputationProtectedMigrationOptions,
): Promise<string> {
  if (classifyProtectedValue(value) === "canonical") {
    return openShopRecordField(prisma, value, reference, {
      shopContext: options.shopContext,
      installationRoot: options.installationRoot,
      createIfMissing: false,
    });
  }
  if (isEncryptedPayload(value)) {
    return decryptString(legacyPayload(value), options.installationRoot);
  }
  return value;
}

async function recoverCommercePhones(
  prisma: PrismaClient,
  options: PhoneReputationProtectedMigrationOptions,
): Promise<Map<string, string>> {
  const phones = new Set<string>();
  const customers = await prisma.customer.findMany({
    select: { id: true, phone: true, phoneEnc: true },
  });
  for (const customer of customers) {
    if (customer.phoneEnc) {
      phones.add(
        normalizePhone(
          await openPhoneSource(
            prisma,
            customer.phoneEnc,
            { recordType: "Customer", recordId: customer.id, field: "phone" },
            options,
          ),
        ),
      );
    } else if (!/^[0-9a-f]{64}$/.test(customer.phone)) {
      phones.add(normalizePhone(customer.phone));
    }
  }

  const orders = await prisma.order.findMany({
    select: { id: true, phone: true },
  });
  for (const order of orders) {
    phones.add(
      normalizePhone(
        await openPhoneSource(
          prisma,
          order.phone,
          { recordType: "Order", recordId: order.id, field: "phone" },
          options,
        ),
      ),
    );
  }

  const byLegacyHash = new Map<string, string>();
  for (const phone of phones) {
    if (!phone) continue;
    const hash = deriveBlindIndex(phone, options.installationRoot);
    const existing = byLegacyHash.get(hash);
    if (existing && existing !== phone) {
      throw new ProtectedDataCorruptionError(
        "context",
        "Legacy phone-reputation hash resolved to multiple commerce phones",
      );
    }
    byLegacyHash.set(hash, phone);
  }
  return byLegacyHash;
}

function recoverAlgerianMobileFromLegacyHash(
  phoneHash: string,
  last4: string | null,
  installationRoot: Buffer,
): string | null {
  if (!/^[0-9a-f]{64}$/.test(phoneHash) || !last4 || !/^\d{4}$/.test(last4)) {
    return null;
  }

  // Existing COD phones are normally Algerian mobile numbers. The retained
  // last four digits reduce the bounded local recovery search to 30,000
  // candidates. This runs only in the one-time migration while the legacy
  // installation root is still available; the root is never retained as a
  // live lookup authority afterward.
  for (const prefix of ["05", "06", "07"]) {
    for (let middle = 0; middle < 10_000; middle += 1) {
      const candidate = `${prefix}${middle.toString().padStart(4, "0")}${last4}`;
      if (deriveBlindIndex(candidate, installationRoot) === phoneHash) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Converge the legacy PhoneReputation installation-root HMACs to the same
 * independently rewrapped per-shop blind-index authority used by Phase 4.
 *
 * The whole reputation rewrite plus its marker is one SQLite transaction, so
 * interruption cannot leave a mixed generation. The marker is written only
 * after every legacy row has a recoverable source phone and a canonical hash.
 */
export async function migratePhoneReputationBlindIndexes(
  prisma: PrismaClient,
  options: PhoneReputationProtectedMigrationOptions,
): Promise<number> {
  const marker = await prisma.setting.findUnique({
    where: { key: PHONE_REPUTATION_MIGRATION_MARKER },
    select: { value: true },
  });
  if (marker) {
    if (marker.value !== PHONE_REPUTATION_MIGRATION_COMPLETE) {
      throw new ProtectedDataCorruptionError(
        "format",
        "Phone-reputation migration marker is invalid",
      );
    }
    return 0;
  }

  const rows = await prisma.phoneReputation.findMany({
    select: { id: true, phoneHash: true, last4: true },
    orderBy: { id: "asc" },
  });
  if (rows.length === 0) {
    if (options.mode === "apply") {
      await prisma.setting.upsert({
        where: { key: PHONE_REPUTATION_MIGRATION_MARKER },
        create: {
          key: PHONE_REPUTATION_MIGRATION_MARKER,
          value: PHONE_REPUTATION_MIGRATION_COMPLETE,
        },
        update: { value: PHONE_REPUTATION_MIGRATION_COMPLETE },
      });
    }
    return 0;
  }

  const commercePhones = await recoverCommercePhones(prisma, options);
  const targets: Array<{ id: string; phoneHash: string }> = [];
  const canonicalHashes = new Set<string>();

  for (const row of rows) {
    const phone =
      commercePhones.get(row.phoneHash) ??
      recoverAlgerianMobileFromLegacyHash(
        row.phoneHash,
        row.last4,
        options.installationRoot,
      );
    if (!phone) {
      throw new ProtectedDataCorruptionError(
        "context",
        `PhoneReputation ${row.id} has no recoverable source phone for protected blind-index migration`,
      );
    }

    const canonical = await deriveShopBlindIndex(
      prisma,
      phone,
      { recordType: "PhoneReputation", field: "phone" },
      {
        shopContext: options.shopContext,
        installationRoot: options.installationRoot,
        createIfMissing: options.mode === "apply",
      },
    );
    if (canonicalHashes.has(canonical)) {
      throw new ProtectedDataCorruptionError(
        "context",
        "Phone-reputation migration would collapse distinct legacy rows",
      );
    }
    canonicalHashes.add(canonical);
    targets.push({ id: row.id, phoneHash: canonical });
  }

  if (options.mode === "verify") return targets.length;

  await prisma.$transaction(async (tx) => {
    for (const target of targets) {
      await tx.phoneReputation.update({
        where: { id: target.id },
        data: { phoneHash: target.phoneHash },
      });
    }
    await tx.setting.upsert({
      where: { key: PHONE_REPUTATION_MIGRATION_MARKER },
      create: {
        key: PHONE_REPUTATION_MIGRATION_MARKER,
        value: PHONE_REPUTATION_MIGRATION_COMPLETE,
      },
      update: { value: PHONE_REPUTATION_MIGRATION_COMPLETE },
    });
  });

  return targets.length;
}
