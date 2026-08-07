import { afterEach, describe, expect, it } from "vitest";

import { deriveShopBlindIndex } from "@/lib/crypto/protected-record";
import { isProtectedValueEnvelope } from "@/lib/crypto/protected-value";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import { db, dbRaw } from "@/lib/db";

let counter = 0;
function uniquePhone(): string {
  counter += 1;
  const seed = (Date.now() % 100_000_000) * 100 + counter;
  return `0${String(seed).padStart(9, "0").slice(-9)}`;
}

function uniqueName(label: string): string {
  counter += 1;
  return `Test ${label} ${counter}`;
}

function uniqueOrderNumber(): string {
  counter += 1;
  return `PHASE4-${Date.now()}-${counter}`;
}

function tamperEnvelope(value: string): string {
  const envelope = JSON.parse(value) as { ciphertext: string };
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
  envelope.ciphertext = ciphertext.toString("base64");
  return JSON.stringify(envelope);
}

const TEST_ADDRESS = "12 Rue des Test, Alger";
const TEST_NOTES = "Livrer après 18h, sonner 2x";
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdConversationIds: string[] = [];

async function makeCustomer(): Promise<string> {
  const customer = await db.customer.create({
    data: { name: uniqueName("Customer"), phone: uniquePhone() },
  });
  createdCustomerIds.push(customer.id);
  return customer.id;
}

afterEach(async () => {
  if (createdOrderIds.length > 0) {
    await dbRaw.orderItem.deleteMany({
      where: { orderId: { in: createdOrderIds } },
    });
    await dbRaw.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdConversationIds.length > 0) {
    await dbRaw.message.deleteMany({
      where: { conversationId: { in: createdConversationIds } },
    });
    await dbRaw.conversation.deleteMany({
      where: { id: { in: createdConversationIds } },
    });
  }
  if (createdCustomerIds.length > 0) {
    await dbRaw.customer.deleteMany({
      where: { id: { in: createdCustomerIds } },
    });
  }
  createdOrderIds.length = 0;
  createdCustomerIds.length = 0;
  createdConversationIds.length = 0;
});

describe("Order contextual PII authority", () => {
  it("stores canonical envelopes and a separate exact-phone index", async () => {
    const customerId = await makeCustomer();
    const phone = uniquePhone();
    const created = await db.order.create({
      data: {
        orderNumber: uniqueOrderNumber(),
        customerId,
        totalPrice: 5000,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: TEST_ADDRESS,
        phone,
        notes: TEST_NOTES,
      },
    });
    createdOrderIds.push(created.id);

    expect(created).toMatchObject({
      phone,
      address: TEST_ADDRESS,
      notes: TEST_NOTES,
    });

    const raw = await dbRaw.order.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(isProtectedValueEnvelope(raw.phone)).toBe(true);
    expect(isProtectedValueEnvelope(raw.address)).toBe(true);
    expect(isProtectedValueEnvelope(raw.notes ?? "")).toBe(true);
    expect(raw.phone).not.toBe(phone);
    expect(raw.phoneBlindIndex).toBe(
      await deriveShopBlindIndex(
        dbRaw,
        phone,
        { recordType: "Order", field: "phone" },
        { shopContext: TEST_SHOP_CONTEXT, createIfMissing: false },
      ),
    );
  });

  it("decrypts single and multiple rows", async () => {
    const customerId = await makeCustomer();
    const firstPhone = uniquePhone();
    const secondPhone = uniquePhone();
    const first = await db.order.create({
      data: {
        orderNumber: uniqueOrderNumber(),
        customerId,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Hydra",
        address: TEST_ADDRESS,
        phone: firstPhone,
      },
    });
    const second = await db.order.create({
      data: {
        orderNumber: uniqueOrderNumber(),
        customerId,
        totalPrice: 2000,
        wilaya: "Oran",
        commune: "Oran",
        address: "Autre adresse",
        phone: secondPhone,
      },
    });
    createdOrderIds.push(first.id, second.id);

    await expect(
      db.order.findUnique({ where: { id: first.id } }),
    ).resolves.toMatchObject({ phone: firstPhone, address: TEST_ADDRESS });

    const rows = await db.order.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(rows.map((row) => row.phone).sort()).toEqual(
      [firstPhone, secondPhone].sort(),
    );
    for (const row of rows) {
      expect(isProtectedValueEnvelope(row.phone)).toBe(false);
      expect(isProtectedValueEnvelope(row.address)).toBe(false);
    }
  });

  it("re-encrypts only the changed protected field and preserves null", async () => {
    const customerId = await makeCustomer();
    const created = await db.order.create({
      data: {
        orderNumber: uniqueOrderNumber(),
        customerId,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Hydra",
        address: TEST_ADDRESS,
        phone: uniquePhone(),
        notes: null,
      },
    });
    createdOrderIds.push(created.id);
    const before = await dbRaw.order.findUniqueOrThrow({
      where: { id: created.id },
    });

    const newPhone = uniquePhone();
    await db.order.update({
      where: { id: created.id },
      data: { phone: newPhone },
    });
    const after = await dbRaw.order.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.phone).not.toBe(before.phone);
    expect(after.address).toBe(before.address);
    expect(after.notes).toBeNull();
    await expect(
      db.order.findUnique({ where: { id: created.id } }),
    ).resolves.toMatchObject({ phone: newPhone, notes: null });
  });

  it("surfaces tampering as typed corruption", async () => {
    const customerId = await makeCustomer();
    const created = await db.order.create({
      data: {
        orderNumber: uniqueOrderNumber(),
        customerId,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Hydra",
        address: TEST_ADDRESS,
        phone: uniquePhone(),
      },
    });
    createdOrderIds.push(created.id);
    const raw = await dbRaw.order.findUniqueOrThrow({
      where: { id: created.id },
    });
    await dbRaw.order.update({
      where: { id: created.id },
      data: { phone: tamperEnvelope(raw.phone) },
    });

    await expect(
      db.order.findUnique({ where: { id: created.id } }),
    ).rejects.toMatchObject({
      code: "PROTECTED_DATA_AUTHENTICATION_FAILED",
    });
  });
});

describe("Conversation contextual PII authority", () => {
  it("stores canonical envelopes and returns plaintext", async () => {
    const name = uniqueName("Conversation");
    const phone = uniquePhone();
    const created = await db.conversation.create({
      data: {
        channel: "whatsapp",
        contactName: name,
        contactPhone: phone,
      },
    });
    createdConversationIds.push(created.id);
    expect(created).toMatchObject({ contactName: name, contactPhone: phone });

    const raw = await dbRaw.conversation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(isProtectedValueEnvelope(raw.contactName)).toBe(true);
    expect(isProtectedValueEnvelope(raw.contactPhone ?? "")).toBe(true);
  });

  it("preserves null and decrypts multiple rows", async () => {
    const first = await db.conversation.create({
      data: {
        channel: "tiktok",
        contactName: uniqueName("No phone"),
        contactPhone: null,
      },
    });
    const secondName = uniqueName("With phone");
    const secondPhone = uniquePhone();
    const second = await db.conversation.create({
      data: {
        channel: "whatsapp",
        contactName: secondName,
        contactPhone: secondPhone,
      },
    });
    createdConversationIds.push(first.id, second.id);

    const rawFirst = await dbRaw.conversation.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(rawFirst.contactPhone).toBeNull();

    const rows = await db.conversation.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === first.id)?.contactPhone).toBeNull();
    expect(rows.find((row) => row.id === second.id)).toMatchObject({
      contactName: secondName,
      contactPhone: secondPhone,
    });
  });

  it("re-encrypts updates and surfaces tampering", async () => {
    const created = await db.conversation.create({
      data: {
        channel: "whatsapp",
        contactName: uniqueName("Original"),
        contactPhone: uniquePhone(),
      },
    });
    createdConversationIds.push(created.id);
    const before = await dbRaw.conversation.findUniqueOrThrow({
      where: { id: created.id },
    });

    const renamed = uniqueName("Renamed");
    await db.conversation.update({
      where: { id: created.id },
      data: { contactName: renamed },
    });
    const after = await dbRaw.conversation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.contactName).not.toBe(before.contactName);
    await expect(
      db.conversation.findUnique({ where: { id: created.id } }),
    ).resolves.toMatchObject({ contactName: renamed });

    await dbRaw.conversation.update({
      where: { id: created.id },
      data: { contactName: tamperEnvelope(after.contactName) },
    });
    await expect(
      db.conversation.findUnique({ where: { id: created.id } }),
    ).rejects.toMatchObject({
      code: "PROTECTED_DATA_AUTHENTICATION_FAILED",
    });
  });
});
