import { PrismaClient } from "@prisma/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  deriveBlindIndex,
  encryptString,
} from "@/lib/crypto/field-crypto";
import {
  getMasterKey,
  _resetMasterKeyCacheForTests,
} from "@/lib/crypto/master-key";
import { deriveShopBlindIndex } from "@/lib/crypto/protected-record";
import { isProtectedValueEnvelope } from "@/lib/crypto/protected-value";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import { migrateShopProtectedData } from "@/lib/maintenance/protected-data-migration";
import { getSecret } from "@/lib/secrets";

const CUSTOMER_ID = "phase4-protected-customer";
const ORDER_ID = "phase4-protected-order";
const SECRET_KEY = "phase4_protected_secret";

let database: PrismaClient;
let temporaryDirectory: string;

function payload(value: string, key: Buffer): string {
  return JSON.stringify(encryptString(value, key));
}

function sqliteLiteral(value: string): string {
  return value.replaceAll("\\", "/").replaceAll("'", "''");
}

function context() {
  return { prisma: database as never, shop: TEST_SHOP_CONTEXT };
}

async function clean(): Promise<void> {
  await database.$transaction([
    database.message.deleteMany(),
    database.conversation.deleteMany(),
    database.orderItem.deleteMany(),
    database.order.deleteMany(),
    database.customer.deleteMany(),
    database.secret.deleteMany(),
    database.protectedKeyAuthority.deleteMany(),
  ]);
}

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(
    join(tmpdir(), "sahelflow-protected-migration-"),
  );
  const databasePath = join(temporaryDirectory, "migration.db");

  // The CI/test sandbox database has the exact deployed schema. SQLite VACUUM
  // INTO creates a consistent disposable copy without touching the shared
  // process database or its cached key authority.
  const source = new PrismaClient();
  try {
    await source.$executeRawUnsafe(
      `VACUUM INTO '${sqliteLiteral(databasePath)}'`,
    );
  } finally {
    await source.$disconnect();
  }

  database = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
  await database.$connect();
});

beforeEach(async () => {
  _resetMasterKeyCacheForTests();
  await clean();
});

afterAll(async () => {
  if (database) {
    await clean();
    await database.$disconnect();
  }
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

describe("protected-data migration", () => {
  it("rewrites legacy customer/order/secret data and converges idempotently", async () => {
    const root = getMasterKey();
    const customerPhone = "0555123456";
    const orderPhone = "0666123456";
    await database.customer.create({
      data: {
        id: CUSTOMER_ID,
        name: payload("Ahmed Benali", root),
        phone: deriveBlindIndex(customerPhone, root),
        phoneEnc: payload(customerPhone, root),
        address: payload("12 Rue Didouche Mourad", root),
        notes: payload("Client fidèle", root),
      },
    });
    await database.order.create({
      data: {
        id: ORDER_ID,
        orderNumber: "PHASE4-PROTECTED-1",
        customerId: CUSTOMER_ID,
        totalPrice: 4500,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: payload("12 Rue Didouche Mourad", root),
        phone: payload(orderPhone, root),
        notes: payload("Livrer après 18h", root),
      },
    });
    const legacySecret = encryptString("secret-value", root);
    await database.secret.create({
      data: { key: SECRET_KEY, ...legacySecret },
    });

    const first = await migrateShopProtectedData(database, {
      mode: "apply",
      shopContext: TEST_SHOP_CONTEXT,
      installationRoot: root,
    });

    expect(first.keyAuthoritiesMigrated).toBe(3);
    expect(first.valuesMigrated).toBeGreaterThanOrEqual(8);
    expect(first.indexesMigrated).toBe(2);
    expect(await database.protectedKeyAuthority.count()).toBe(3);

    const customer = await database.customer.findUniqueOrThrow({
      where: { id: CUSTOMER_ID },
    });
    const order = await database.order.findUniqueOrThrow({
      where: { id: ORDER_ID },
    });
    const secret = await database.secret.findUniqueOrThrow({
      where: { key: SECRET_KEY },
    });

    for (const value of [
      customer.name,
      customer.phoneEnc,
      customer.address,
      customer.notes,
      order.phone,
      order.address,
      order.notes,
      secret.ciphertext,
    ]) {
      expect(isProtectedValueEnvelope(value)).toBe(true);
    }
    expect(customer.phone).toBe(
      await deriveShopBlindIndex(
        database,
        customerPhone,
        { recordType: "Customer", field: "phone" },
        { shopContext: TEST_SHOP_CONTEXT, installationRoot: root },
      ),
    );
    expect(order.phoneBlindIndex).toBe(
      await deriveShopBlindIndex(
        database,
        orderPhone,
        { recordType: "Order", field: "phone" },
        { shopContext: TEST_SHOP_CONTEXT, installationRoot: root },
      ),
    );
    await expect(
      getSecret(context(), SECRET_KEY, { installationRoot: root }),
    ).resolves.toBe("secret-value");

    const second = await migrateShopProtectedData(database, {
      mode: "apply",
      shopContext: TEST_SHOP_CONTEXT,
      installationRoot: root,
    });
    expect(second.keyAuthoritiesVerified).toBe(3);
    expect(second.keyAuthoritiesMigrated).toBe(0);
    expect(second.valuesMigrated).toBe(0);
    expect(second.indexesMigrated).toBe(0);
    expect(second.valuesVerified).toBeGreaterThanOrEqual(8);
  });

  it("verify reports legacy work without mutating rows or key authority", async () => {
    const root = getMasterKey();
    const phone = "0777123456";
    await database.customer.create({
      data: {
        id: CUSTOMER_ID,
        name: payload("Nadia", root),
        phone: deriveBlindIndex(phone, root),
        phoneEnc: payload(phone, root),
      },
    });

    const before = await database.customer.findUniqueOrThrow({
      where: { id: CUSTOMER_ID },
    });
    const stats = await migrateShopProtectedData(database, {
      mode: "verify",
      shopContext: TEST_SHOP_CONTEXT,
      installationRoot: root,
    });
    const after = await database.customer.findUniqueOrThrow({
      where: { id: CUSTOMER_ID },
    });

    expect(stats.keyAuthoritiesMigrated).toBe(3);
    expect(stats.valuesMigrated).toBeGreaterThan(0);
    expect(stats.indexesMigrated).toBe(1);
    expect(after).toEqual(before);
    expect(await database.protectedKeyAuthority.count()).toBe(0);
  });
});
