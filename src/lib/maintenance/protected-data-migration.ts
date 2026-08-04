import "server-only";

import type { PrismaClient } from "@prisma/client";

import {
  decryptString,
  isEncryptedPayload,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import {
  deriveShopBlindIndex,
  openShopRecordField,
  sealShopRecordField,
  type ProtectedRecordReference,
} from "@/lib/crypto/protected-record";
import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";
import { isProtectedValueEnvelope } from "@/lib/crypto/protected-value";
import { getSecret, setSecret } from "@/lib/secrets";
import type { ShopContext } from "@/lib/shops/context";

export type ProtectedDataMigrationMode = "verify" | "apply";

export interface ProtectedDataMigrationStats {
  customers: number;
  orders: number;
  conversations: number;
  messages: number;
  secrets: number;
  valuesVerified: number;
  valuesMigrated: number;
  indexesMigrated: number;
}

export interface ProtectedDataMigrationOptions {
  mode: ProtectedDataMigrationMode;
  shopContext: ShopContext;
  installationRoot: Buffer;
}

type MigrationPrisma = PrismaClient;

type MutableStats = ProtectedDataMigrationStats;

function emptyStats(): MutableStats {
  return {
    customers: 0,
    orders: 0,
    conversations: 0,
    messages: 0,
    secrets: 0,
    valuesVerified: 0,
    valuesMigrated: 0,
    indexesMigrated: 0,
  };
}

function legacyPayload(value: string): EncryptedPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new ProtectedDataCorruptionError(
      "format",
      "Legacy protected value is malformed",
      cause,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProtectedDataCorruptionError(
      "format",
      "Legacy protected value is not an object",
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
      "Legacy protected value has missing fields",
    );
  }
  return {
    iv: payload.iv,
    ciphertext: payload.ciphertext,
    tag: payload.tag,
  };
}

async function readPlaintext(
  prisma: MigrationPrisma,
  value: string,
  reference: ProtectedRecordReference,
  options: ProtectedDataMigrationOptions,
  stats: MutableStats,
): Promise<{ plaintext: string; canonical: boolean }> {
  if (isProtectedValueEnvelope(value)) {
    const plaintext = await openShopRecordField(prisma, value, reference, {
      shopContext: options.shopContext,
      installationRoot: options.installationRoot,
    });
    stats.valuesVerified += 1;
    return { plaintext, canonical: true };
  }
  if (isEncryptedPayload(value)) {
    return {
      plaintext: decryptString(legacyPayload(value), options.installationRoot),
      canonical: false,
    };
  }
  return { plaintext: value, canonical: false };
}

async function migrateField(
  prisma: MigrationPrisma,
  value: string | null,
  reference: ProtectedRecordReference,
  options: ProtectedDataMigrationOptions,
  stats: MutableStats,
): Promise<{ plaintext: string | null; stored: string | null; changed: boolean }> {
  if (value === null) return { plaintext: null, stored: null, changed: false };
  const current = await readPlaintext(prisma, value, reference, options, stats);
  if (current.canonical) {
    return { plaintext: current.plaintext, stored: value, changed: false };
  }
  if (options.mode === "verify") {
    stats.valuesMigrated += 1;
    return { plaintext: current.plaintext, stored: value, changed: true };
  }
  const stored = await sealShopRecordField(
    prisma,
    current.plaintext,
    reference,
    {
      shopContext: options.shopContext,
      installationRoot: options.installationRoot,
    },
  );
  stats.valuesMigrated += 1;
  return { plaintext: current.plaintext, stored, changed: true };
}

async function migrateCustomers(
  prisma: MigrationPrisma,
  options: ProtectedDataMigrationOptions,
  stats: MutableStats,
): Promise<void> {
  const rows = await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      phoneEnc: true,
      nameBlindIndex: true,
      phone2: true,
      address: true,
      notes: true,
    },
  });
  stats.customers = rows.length;

  for (const row of rows) {
    const name = await migrateField(
      prisma,
      row.name,
      { recordType: "Customer", recordId: row.id, field: "name" },
      options,
      stats,
    );
    const phone2 = await migrateField(
      prisma,
      row.phone2,
      { recordType: "Customer", recordId: row.id, field: "phone2" },
      options,
      stats,
    );
    const address = await migrateField(
      prisma,
      row.address,
      { recordType: "Customer", recordId: row.id, field: "address" },
      options,
      stats,
    );
    const notes = await migrateField(
      prisma,
      row.notes,
      { recordType: "Customer", recordId: row.id, field: "notes" },
      options,
      stats,
    );

    let phonePlaintext: string;
    let phoneStored = row.phoneEnc;
    let phoneChanged = false;
    if (row.phoneEnc) {
      const phone = await migrateField(
        prisma,
        row.phoneEnc,
        { recordType: "Customer", recordId: row.id, field: "phone" },
        options,
        stats,
      );
      if (phone.plaintext === null) {
        throw new ProtectedDataCorruptionError(
          "format",
          `Customer ${row.id} has an empty encrypted phone`,
        );
      }
      phonePlaintext = phone.plaintext;
      phoneStored = phone.stored;
      phoneChanged = phone.changed;
    } else if (!/^[0-9a-f]{64}$/.test(row.phone)) {
      phonePlaintext = row.phone;
      phoneChanged = true;
      if (options.mode === "apply") {
        phoneStored = await sealShopRecordField(
          prisma,
          phonePlaintext,
          { recordType: "Customer", recordId: row.id, field: "phone" },
          {
            shopContext: options.shopContext,
            installationRoot: options.installationRoot,
          },
        );
      }
      stats.valuesMigrated += 1;
    } else {
      throw new ProtectedDataCorruptionError(
        "format",
        `Customer ${row.id} has a blind index without recoverable phone ciphertext`,
      );
    }

    const phoneIndex = await deriveShopBlindIndex(
      prisma,
      phonePlaintext,
      { recordType: "Customer", field: "phone" },
      {
        shopContext: options.shopContext,
        installationRoot: options.installationRoot,
      },
    );
    const nameIndex = await deriveShopBlindIndex(
      prisma,
      name.plaintext ?? "",
      { recordType: "Customer", field: "name" },
      {
        shopContext: options.shopContext,
        installationRoot: options.installationRoot,
      },
    );
    const indexesChanged =
      row.phone !== phoneIndex || row.nameBlindIndex !== nameIndex;
    if (indexesChanged) stats.indexesMigrated += 1;

    if (
      options.mode === "apply" &&
      (name.changed ||
        phoneChanged ||
        phone2.changed ||
        address.changed ||
        notes.changed ||
        indexesChanged)
    ) {
      await prisma.customer.update({
        where: { id: row.id },
        data: {
          name: name.stored!,
          phone: phoneIndex,
          phoneEnc: phoneStored,
          nameBlindIndex: nameIndex,
          phone2: phone2.stored,
          address: address.stored,
          notes: notes.stored,
        },
      });
    }
  }
}

async function migrateOrders(
  prisma: MigrationPrisma,
  options: ProtectedDataMigrationOptions,
  stats: MutableStats,
): Promise<void> {
  const rows = await prisma.order.findMany({
    select: {
      id: true,
      phone: true,
      phoneBlindIndex: true,
      address: true,
      notes: true,
    },
  });
  stats.orders = rows.length;
  for (const row of rows) {
    const phone = await migrateField(
      prisma,
      row.phone,
      { recordType: "Order", recordId: row.id, field: "phone" },
      options,
      stats,
    );
    const address = await migrateField(
      prisma,
      row.address,
      { recordType: "Order", recordId: row.id, field: "address" },
      options,
      stats,
    );
    const notes = await migrateField(
      prisma,
      row.notes,
      { recordType: "Order", recordId: row.id, field: "notes" },
      options,
      stats,
    );
    const phoneIndex = await deriveShopBlindIndex(
      prisma,
      phone.plaintext!,
      { recordType: "Order", field: "phone" },
      {
        shopContext: options.shopContext,
        installationRoot: options.installationRoot,
      },
    );
    const indexChanged = row.phoneBlindIndex !== phoneIndex;
    if (indexChanged) stats.indexesMigrated += 1;
    if (
      options.mode === "apply" &&
      (phone.changed || address.changed || notes.changed || indexChanged)
    ) {
      await prisma.order.update({
        where: { id: row.id },
        data: {
          phone: phone.stored!,
          phoneBlindIndex: phoneIndex,
          address: address.stored!,
          notes: notes.stored,
        },
      });
    }
  }
}

async function migrateConversations(
  prisma: MigrationPrisma,
  options: ProtectedDataMigrationOptions,
  stats: MutableStats,
): Promise<void> {
  const rows = await prisma.conversation.findMany({
    select: { id: true, contactName: true, contactPhone: true },
  });
  stats.conversations = rows.length;
  for (const row of rows) {
    const name = await migrateField(
      prisma,
      row.contactName,
      { recordType: "Conversation", recordId: row.id, field: "contactName" },
      options,
      stats,
    );
    const phone = await migrateField(
      prisma,
      row.contactPhone,
      { recordType: "Conversation", recordId: row.id, field: "contactPhone" },
      options,
      stats,
    );
    if (options.mode === "apply" && (name.changed || phone.changed)) {
      await prisma.conversation.update({
        where: { id: row.id },
        data: { contactName: name.stored!, contactPhone: phone.stored },
      });
    }
  }
}

async function migrateMessages(
  prisma: MigrationPrisma,
  options: ProtectedDataMigrationOptions,
  stats: MutableStats,
): Promise<void> {
  const rows = await prisma.message.findMany({ select: { id: true, body: true } });
  stats.messages = rows.length;
  for (const row of rows) {
    const body = await migrateField(
      prisma,
      row.body,
      { recordType: "Message", recordId: row.id, field: "body" },
      options,
      stats,
    );
    if (options.mode === "apply" && body.changed) {
      await prisma.message.update({
        where: { id: row.id },
        data: { body: body.stored! },
      });
    }
  }
}

async function migrateSecrets(
  prisma: MigrationPrisma,
  options: ProtectedDataMigrationOptions,
  stats: MutableStats,
): Promise<void> {
  const rows = await prisma.secret.findMany({ select: { key: true, ciphertext: true } });
  stats.secrets = rows.length;
  const serviceContext = {
    prisma: prisma as never,
    shop: options.shopContext,
  };
  for (const row of rows) {
    const plaintext = await getSecret(serviceContext, row.key);
    if (plaintext === null) {
      throw new ProtectedDataCorruptionError(
        "format",
        `Secret ${row.key} disappeared during migration`,
      );
    }
    if (isProtectedValueEnvelope(row.ciphertext)) {
      stats.valuesVerified += 1;
      continue;
    }
    stats.valuesMigrated += 1;
    if (options.mode === "apply") {
      await setSecret(serviceContext, row.key, plaintext);
    }
  }
}

/**
 * Verify or apply the Phase 4 protected-data migration for one shop database.
 * Every row update is idempotent and atomic. Interruption leaves a mixed but
 * readable generation; re-running verifies canonical envelopes and continues
 * remaining legacy/plaintext rows without double-encrypting them.
 */
export async function migrateShopProtectedData(
  prisma: MigrationPrisma,
  options: ProtectedDataMigrationOptions,
): Promise<ProtectedDataMigrationStats> {
  const stats = emptyStats();
  await migrateCustomers(prisma, options, stats);
  await migrateOrders(prisma, options, stats);
  await migrateConversations(prisma, options, stats);
  await migrateMessages(prisma, options, stats);
  await migrateSecrets(prisma, options, stats);
  return stats;
}
