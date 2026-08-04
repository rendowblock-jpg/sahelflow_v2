import { afterEach, describe, expect, it } from "vitest";

import { deriveShopBlindIndex } from "@/lib/crypto/protected-record";
import { isProtectedValueEnvelope } from "@/lib/crypto/protected-value";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import { db, dbRaw } from "@/lib/db";

let phoneCounter = 0;
function uniquePhone(): string {
  phoneCounter += 1;
  const seed = (Date.now() % 100_000_000) * 100 + phoneCounter;
  return `0${String(seed).padStart(9, "0").slice(-9)}`;
}

function uniqueName(label: string): string {
  return `Test ${label} ${phoneCounter}`;
}

function tamperEnvelope(value: string): string {
  const envelope = JSON.parse(value) as { ciphertext: string };
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
  envelope.ciphertext = ciphertext.toString("base64");
  return JSON.stringify(envelope);
}

const TEST_ADDRESS = "12 Rue des Test, Alger";
const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length > 0) {
    await dbRaw.customer.deleteMany({ where: { id: { in: createdIds } } });
  }
  createdIds.length = 0;
});

describe("Customer contextual PII authority", () => {
  it("stores canonical envelopes and a purpose-separated phone index", async () => {
    const phone = uniquePhone();
    const name = uniqueName("Ahmed");
    const created = await db.customer.create({
      data: { name, phone, address: TEST_ADDRESS },
    });
    createdIds.push(created.id);

    expect(created).toMatchObject({ name, phone, address: TEST_ADDRESS });
    expect("phoneEnc" in created).toBe(false);

    const raw = await dbRaw.customer.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(isProtectedValueEnvelope(raw.name)).toBe(true);
    expect(isProtectedValueEnvelope(raw.phoneEnc ?? "")).toBe(true);
    expect(isProtectedValueEnvelope(raw.address ?? "")).toBe(true);
    expect(raw.name).not.toBe(name);
    expect(raw.phone).not.toBe(phone);
    expect(raw.phone).toBe(
      await deriveShopBlindIndex(
        dbRaw,
        phone,
        { recordType: "Customer", field: "phone" },
        { shopContext: TEST_SHOP_CONTEXT, createIfMissing: false },
      ),
    );
  });

  it("rewrites a plaintext phone lookup through current and legacy indexes", async () => {
    const phone = uniquePhone();
    const name = uniqueName("Fatima");
    const created = await db.customer.create({ data: { name, phone } });
    createdIds.push(created.id);

    await expect(
      db.customer.findUnique({ where: { phone } }),
    ).resolves.toMatchObject({ id: created.id, name, phone });
  });

  it("decrypts multiple rows and removes the companion ciphertext", async () => {
    const first = await db.customer.create({
      data: { name: uniqueName("A"), phone: uniquePhone() },
    });
    const second = await db.customer.create({
      data: { name: uniqueName("B"), phone: uniquePhone() },
    });
    createdIds.push(first.id, second.id);

    const rows = await db.customer.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.phone).toMatch(/^0\d{9}$/);
      expect(isProtectedValueEnvelope(row.name)).toBe(false);
      expect("phoneEnc" in row).toBe(false);
    }
  });

  it("preserves exact partial projections", async () => {
    const phone = uniquePhone();
    const created = await db.customer.create({
      data: { name: uniqueName("Projection"), phone, address: TEST_ADDRESS },
    });
    createdIds.push(created.id);

    await expect(
      db.customer.findUnique({
        where: { id: created.id },
        select: { phone: true },
      }),
    ).resolves.toEqual({ phone });

    await expect(
      db.customer.findUnique({
        where: { id: created.id },
        select: { id: true },
      }),
    ).resolves.toEqual({ id: created.id });
  });

  it("re-encrypts only changed protected fields", async () => {
    const firstPhone = uniquePhone();
    const created = await db.customer.create({
      data: { name: uniqueName("Original"), phone: firstPhone },
    });
    createdIds.push(created.id);
    const before = await dbRaw.customer.findUniqueOrThrow({
      where: { id: created.id },
    });

    const renamed = uniqueName("Renamed");
    await db.customer.update({
      where: { id: created.id },
      data: { name: renamed },
    });
    const afterName = await dbRaw.customer.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(afterName.name).not.toBe(before.name);
    expect(afterName.phone).toBe(before.phone);
    expect(afterName.phoneEnc).toBe(before.phoneEnc);

    const secondPhone = uniquePhone();
    await db.customer.update({
      where: { id: created.id },
      data: { phone: secondPhone },
    });
    const afterPhone = await dbRaw.customer.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(afterPhone.phone).not.toBe(afterName.phone);
    expect(afterPhone.phoneEnc).not.toBe(afterName.phoneEnc);
    await expect(
      db.customer.findUnique({ where: { phone: secondPhone } }),
    ).resolves.toMatchObject({ id: created.id, phone: secondPhone, name: renamed });
  });

  it("encrypts both upsert paths", async () => {
    const phone = uniquePhone();
    const name = uniqueName("Upsert");
    const created = await db.customer.upsert({
      where: { phone },
      create: { name, phone },
      update: { name: "unused" },
    });
    createdIds.push(created.id);
    expect(created).toMatchObject({ name, phone });
    expect(
      isProtectedValueEnvelope(
        (await dbRaw.customer.findUniqueOrThrow({ where: { id: created.id } }))
          .name,
      ),
    ).toBe(true);

    const updatedName = uniqueName("Updated");
    await expect(
      db.customer.upsert({
        where: { phone },
        create: { name: "unused", phone },
        update: { name: updatedName },
      }),
    ).resolves.toMatchObject({ id: created.id, name: updatedName, phone });
  });

  it("enforces uniqueness and supports plaintext-phone delete", async () => {
    const phone = uniquePhone();
    const created = await db.customer.create({
      data: { name: uniqueName("First"), phone },
    });
    createdIds.push(created.id);

    await expect(
      db.customer.create({ data: { name: uniqueName("Duplicate"), phone } }),
    ).rejects.toThrow();

    await db.customer.delete({ where: { phone } });
    createdIds.splice(createdIds.indexOf(created.id), 1);
    await expect(db.customer.findUnique({ where: { phone } })).resolves.toBeNull();
  });

  it("surfaces tampering as typed corruption without returning stored bytes", async () => {
    const created = await db.customer.create({
      data: { name: uniqueName("Tamper"), phone: uniquePhone() },
    });
    createdIds.push(created.id);
    const raw = await dbRaw.customer.findUniqueOrThrow({
      where: { id: created.id },
    });
    await dbRaw.customer.update({
      where: { id: created.id },
      data: { name: tamperEnvelope(raw.name) },
    });

    await expect(
      db.customer.findUnique({ where: { id: created.id } }),
    ).rejects.toMatchObject({
      code: "PROTECTED_DATA_AUTHENTICATION_FAILED",
    });
  });
});
