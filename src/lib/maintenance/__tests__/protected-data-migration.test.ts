import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { dbRaw } from "@/lib/db";
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
const context = { prisma: dbRaw as never, shop: TEST_SHOP_CONTEXT };

function payload(value: string, key: Buffer): string {
  return JSON.stringify(encryptString(value, key));
}

async function clean(): Promise<void> {
  await dbRaw.order.deleteMany({ where: { id: ORDER_ID } });
  await dbRaw.customer.deleteMany({ where: { id: CUSTOMER_ID } });
  await dbRaw.secret.deleteMany({ where: { key: SECRET_KEY } });
  await dbRaw.protectedKeyAuthority.deleteMany();
}

beforeEach(async () => {
  _resetMasterKeyCacheForTests();
  await clean();
});

afterAll(async () => {
  await clean();
});

describe("protected-data migration", () => {
  it("rewrites legacy customer/order/secret data and converges idempotently", async () => {
    const root = getMasterKey();
    const customerPhone = "0555123456";
    const orderPhone = "0666123456";
    await dbRaw.customer.create({
      data: {
        id: CUSTOMER_ID,
        name: payload("Ahmed Benali", root),
        phone: deriveBlindIndex(customerPhone, root),
        phoneEnc: payload(customerPhone, root),
        address: payload("12 Rue Didouche Mourad", root),
        notes: payload("Client fidèle", root),
      },
    });
    await dbRaw.order.create({
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
    await dbRaw.secret.create({
      data: { key: SECRET_KEY, ...legacySecret },
    });

    const first = await migrateShopProtectedData(dbRaw, {
      mode: "apply",
      shopContext: TEST_SHOP_CONTEXT,
      installationRoot: root,
    });

    expect(first.valuesMigrated).toBeGreaterThanOrEqual(8);
    expect(first.indexesMigrated).toBe(2);

    const customer = await dbRaw.customer.findUniqueOrThrow({
      where: { id: CUSTOMER_ID },
    });
    const order = await dbRaw.order.findUniqueOrThrow({ where: { id: ORDER_ID } });
    const secret = await dbRaw.secret.findUniqueOrThrow({
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
        dbRaw,
        customerPhone,
        { recordType: "Customer", field: "phone" },
        { shopContext: TEST_SHOP_CONTEXT, installationRoot: root },
      ),
    );
    expect(order.phoneBlindIndex).toBe(
      await deriveShopBlindIndex(
        dbRaw,
        orderPhone,
        { recordType: "Order", field: "phone" },
        { shopContext: TEST_SHOP_CONTEXT, installationRoot: root },
      ),
    );
    await expect(getSecret(context, SECRET_KEY)).resolves.toBe("secret-value");

    const second = await migrateShopProtectedData(dbRaw, {
      mode: "apply",
      shopContext: TEST_SHOP_CONTEXT,
      installationRoot: root,
    });
    expect(second.valuesMigrated).toBe(0);
    expect(second.indexesMigrated).toBe(0);
    expect(second.valuesVerified).toBeGreaterThanOrEqual(8);
  });

  it("verify reports legacy work without rewriting seller rows", async () => {
    const root = getMasterKey();
    const phone = "0777123456";
    await dbRaw.customer.create({
      data: {
        id: CUSTOMER_ID,
        name: payload("Nadia", root),
        phone: deriveBlindIndex(phone, root),
        phoneEnc: payload(phone, root),
      },
    });

    const before = await dbRaw.customer.findUniqueOrThrow({
      where: { id: CUSTOMER_ID },
    });
    const stats = await migrateShopProtectedData(dbRaw, {
      mode: "verify",
      shopContext: TEST_SHOP_CONTEXT,
      installationRoot: root,
    });
    const after = await dbRaw.customer.findUniqueOrThrow({
      where: { id: CUSTOMER_ID },
    });

    expect(stats.valuesMigrated).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });
});
