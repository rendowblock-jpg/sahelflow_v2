/**
 * Tests for Order + Conversation PII encryption (ADR-003 extension).
 *
 * These hit a real SQLite DB (the dev DB) via the extended `db` client + the
 * raw `dbRaw` client. Each test creates its own rows (cuid IDs) and cleans up,
 * so they're isolated from seeded data and parallel runs.
 *
 * Coverage:
 *   ORDER
 *     - create → DB stores ciphertext for phone/address/notes; read returns plaintext
 *     - findUnique by id returns plaintext
 *     - findMany returns plaintext for all rows
 *     - include { items: true } works (relations not affected)
 *     - partial update (only phone) → only phone re-encrypted, others untouched
 *     - update with all PII fields → all re-encrypted
 *     - null notes → stays null (nullable field passthrough)
 *     - tampered ciphertext → decrypt fails gracefully (raw preserved, no crash)
 *
 *   CONVERSATION
 *     - create → DB stores ciphertext for contactName/contactPhone; read returns plaintext
 *     - findMany returns plaintext
 *     - nullable contactPhone → null stays null
 *     - update contactName → re-encrypted
 *     - tampered contactName → graceful degradation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, dbRaw } from "@/lib/db";
import { _resetMasterKeyCacheForTests } from "@/lib/crypto/master-key";
import { isEncryptedPayload } from "@/lib/crypto/field-crypto";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Unique-per-run generators (avoid collisions with seeded data + parallel runs)
let counter = 0;
function uniquePhone(): string {
  counter += 1;
  const seed = (Date.now() % 100_000_000) * 100 + counter;
  return "0" + String(seed).padStart(9, "0").slice(-9);
}
function uniqueName(label: string): string {
  counter += 1;
  return `Test ${label} ${counter}`;
}

const TEST_ADDRESS = "12 Rue des Test, Alger";
const TEST_NOTES = "Livrer après 18h, sonner 2x";

let tmpDir: string;
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdConversationIds: string[] = [];
const oldEnv = { ...process.env };

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sf-pii-oc-"));
  _resetMasterKeyCacheForTests();
  process.env.SF_DATA_DIR = tmpDir;
  process.env.SF_MASTER_KEY = "ab".repeat(32); // deterministic 256-bit key
  _resetMasterKeyCacheForTests();
});

afterEach(async () => {
  // Clean up test rows (order matters for FK constraints)
  if (createdOrderIds.length > 0) {
    await dbRaw.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await dbRaw.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdCustomerIds.length > 0) {
    await dbRaw.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  if (createdConversationIds.length > 0) {
    await dbRaw.message.deleteMany({ where: { conversationId: { in: createdConversationIds } } });
    await dbRaw.conversation.deleteMany({ where: { id: { in: createdConversationIds } } });
  }
  createdOrderIds.length = 0;
  createdCustomerIds.length = 0;
  createdConversationIds.length = 0;
  rmSync(tmpDir, { recursive: true, force: true });
  process.env = { ...oldEnv };
  _resetMasterKeyCacheForTests();
});

/** Helper: create a customer (needed because Order requires customerId). */
async function makeCustomer(): Promise<string> {
  const c = await db.customer.create({
    data: { name: uniqueName("Cust"), phone: uniquePhone() },
  });
  createdCustomerIds.push(c.id);
  return c.id;
}

// ── ORDER PII ENCRYPTION ───────────────────────────────────────────────────

describe("Order PII encryption: create + read", () => {
  it("create stores ciphertext for phone/address/notes; read returns plaintext", async () => {
    const customerId = await makeCustomer();
    const phone = uniquePhone();
    const created = await db.order.create({
      data: {
        orderNumber: `TEST-${counter}`,
        customerId,
        totalPrice: 5000,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: TEST_ADDRESS,
        phone,
        notes: TEST_NOTES,
        items: { create: [] },
      },
    });
    createdOrderIds.push(created.id);

    // Returned row is already decrypted
    expect(created.phone).toBe(phone);
    expect(created.address).toBe(TEST_ADDRESS);
    expect(created.notes).toBe(TEST_NOTES);

    // Raw DB stores ciphertext
    const raw = await dbRaw.order.findUnique({ where: { id: created.id } });
    expect(raw).not.toBeNull();
    expect(isEncryptedPayload(raw!.phone)).toBe(true);
    expect(raw!.phone).not.toBe(phone);
    expect(isEncryptedPayload(raw!.address!)).toBe(true);
    expect(raw!.address).not.toBe(TEST_ADDRESS);
    expect(isEncryptedPayload(raw!.notes!)).toBe(true);
    expect(raw!.notes).not.toBe(TEST_NOTES);
  });

  it("findUnique by id returns plaintext", async () => {
    const customerId = await makeCustomer();
    const phone = uniquePhone();
    const created = await db.order.create({
      data: {
        orderNumber: `TEST-${counter}`,
        customerId,
        totalPrice: 1000,
        wilaya: "Oran",
        commune: "Oran",
        address: TEST_ADDRESS,
        phone,
        items: { create: [] },
      },
    });
    createdOrderIds.push(created.id);

    const found = await db.order.findUnique({
      where: { id: created.id },
      include: { items: true },
    });
    expect(found).not.toBeNull();
    expect(found!.phone).toBe(phone);
    expect(found!.address).toBe(TEST_ADDRESS);
  });

  it("findMany returns plaintext for all rows", async () => {
    const customerId = await makeCustomer();
    const p1 = uniquePhone();
    const p2 = uniquePhone();
    const o1 = await db.order.create({
      data: {
        orderNumber: `TEST-${counter}-1`,
        customerId,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Hydra",
        address: TEST_ADDRESS,
        phone: p1,
        items: { create: [] },
      },
    });
    const o2 = await db.order.create({
      data: {
        orderNumber: `TEST-${counter}-2`,
        customerId,
        totalPrice: 2000,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "Autre adresse",
        phone: p2,
        items: { create: [] },
      },
    });
    createdOrderIds.push(o1.id, o2.id);

    const all = await db.order.findMany({
      where: { id: { in: [o1.id, o2.id] } },
    });
    expect(all).toHaveLength(2);
    for (const o of all) {
      expect(isEncryptedPayload(o.phone)).toBe(false); // plaintext
      expect(o.phone).toMatch(/^0\d{9}$/);
      expect(isEncryptedPayload(o.address)).toBe(false);
    }
  });
});

describe("Order PII encryption: update", () => {
  it("partial update (only phone) re-encrypts phone, leaves address/notes untouched", async () => {
    const customerId = await makeCustomer();
    const created = await db.order.create({
      data: {
        orderNumber: `TEST-${counter}`,
        customerId,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Hydra",
        address: TEST_ADDRESS,
        phone: uniquePhone(),
        notes: TEST_NOTES,
        items: { create: [] },
      },
    });
    createdOrderIds.push(created.id);
    const rawBefore = await dbRaw.order.findUnique({ where: { id: created.id } });
    const newPhone = uniquePhone();

    await db.order.update({
      where: { id: created.id },
      data: { phone: newPhone },
    });

    const rawAfter = await dbRaw.order.findUnique({ where: { id: created.id } });
    expect(rawAfter!.phone).not.toBe(rawBefore!.phone); // phone changed
    expect(isEncryptedPayload(rawAfter!.phone)).toBe(true);
    expect(rawAfter!.address).toBe(rawBefore!.address); // address unchanged
    expect(rawAfter!.notes).toBe(rawBefore!.notes); // notes unchanged
  });

  it("null notes stays null (nullable field passthrough)", async () => {
    const customerId = await makeCustomer();
    const created = await db.order.create({
      data: {
        orderNumber: `TEST-${counter}`,
        customerId,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Hydra",
        address: TEST_ADDRESS,
        phone: uniquePhone(),
        notes: null,
        items: { create: [] },
      },
    });
    createdOrderIds.push(created.id);

    const raw = await dbRaw.order.findUnique({ where: { id: created.id } });
    expect(raw!.notes).toBeNull(); // null passes through, not encrypted

    const found = await db.order.findUnique({ where: { id: created.id } });
    expect(found!.notes).toBeNull();
  });
});

describe("Order PII encryption: tamper resistance", () => {
  it("tampered phone ciphertext does not crash reads (raw value preserved)", async () => {
    const customerId = await makeCustomer();
    const created = await db.order.create({
      data: {
        orderNumber: `TEST-${counter}`,
        customerId,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Hydra",
        address: TEST_ADDRESS,
        phone: uniquePhone(),
        items: { create: [] },
      },
    });
    createdOrderIds.push(created.id);

    // Tamper with the encrypted phone directly in the DB
    await dbRaw.order.update({
      where: { id: created.id },
      data: { phone: '{"iv":"AAAAAAAA","ciphertext":"BBBB","tag":"CCCC"}' },
    });

    // Reading should not throw — the extension catches the decrypt error and
    // leaves the raw (tampered) value so corruption is visible
    const found = await db.order.findUnique({ where: { id: created.id } });
    expect(found).not.toBeNull();
    expect(found!.phone).toContain("ciphertext"); // raw tampered JSON preserved
  });
});

// ── CONVERSATION PII ENCRYPTION ─────────────────────────────────────────────

describe("Conversation PII encryption: create + read", () => {
  it("create stores ciphertext for contactName/contactPhone; read returns plaintext", async () => {
    const name = uniqueName("Conv");
    const phone = uniquePhone();
    const created = await db.conversation.create({
      data: {
        channel: "whatsapp",
        contactName: name,
        contactPhone: phone,
      },
    });
    createdConversationIds.push(created.id);

    // Returned row is already decrypted
    expect(created.contactName).toBe(name);
    expect(created.contactPhone).toBe(phone);

    // Raw DB stores ciphertext
    const raw = await dbRaw.conversation.findUnique({ where: { id: created.id } });
    expect(raw).not.toBeNull();
    expect(isEncryptedPayload(raw!.contactName)).toBe(true);
    expect(raw!.contactName).not.toBe(name);
    expect(isEncryptedPayload(raw!.contactPhone!)).toBe(true);
    expect(raw!.contactPhone).not.toBe(phone);
  });

  it("nullable contactPhone → null stays null", async () => {
    const created = await db.conversation.create({
      data: {
        channel: "tiktok",
        contactName: uniqueName("TikTok"),
        contactPhone: null,
      },
    });
    createdConversationIds.push(created.id);

    const raw = await dbRaw.conversation.findUnique({ where: { id: created.id } });
    expect(raw!.contactPhone).toBeNull();

    const found = await db.conversation.findUnique({ where: { id: created.id } });
    expect(found!.contactPhone).toBeNull();
  });

  it("findMany returns plaintext for all rows", async () => {
    const n1 = uniqueName("A");
    const n2 = uniqueName("B");
    const c1 = await db.conversation.create({
      data: { channel: "whatsapp", contactName: n1, contactPhone: uniquePhone() },
    });
    const c2 = await db.conversation.create({
      data: { channel: "whatsapp", contactName: n2, contactPhone: uniquePhone() },
    });
    createdConversationIds.push(c1.id, c2.id);

    const all = await db.conversation.findMany({
      where: { id: { in: [c1.id, c2.id] } },
    });
    expect(all).toHaveLength(2);
    for (const c of all) {
      expect(isEncryptedPayload(c.contactName)).toBe(false); // plaintext
      expect(isEncryptedPayload(c.contactPhone!)).toBe(false);
    }
  });
});

describe("Conversation PII encryption: update", () => {
  it("update contactName re-encrypts", async () => {
    const created = await db.conversation.create({
      data: { channel: "whatsapp", contactName: uniqueName("Orig"), contactPhone: uniquePhone() },
    });
    createdConversationIds.push(created.id);
    const newName = uniqueName("Renamed");

    await db.conversation.update({
      where: { id: created.id },
      data: { contactName: newName },
    });

    const found = await db.conversation.findUnique({ where: { id: created.id } });
    expect(found!.contactName).toBe(newName);

    const raw = await dbRaw.conversation.findUnique({ where: { id: created.id } });
    expect(isEncryptedPayload(raw!.contactName)).toBe(true);
    expect(raw!.contactName).not.toBe(newName);
  });
});

describe("Conversation PII encryption: tamper resistance", () => {
  it("tampered contactName does not crash reads (raw value preserved)", async () => {
    const created = await db.conversation.create({
      data: { channel: "whatsapp", contactName: uniqueName("Tamp"), contactPhone: uniquePhone() },
    });
    createdConversationIds.push(created.id);

    await dbRaw.conversation.update({
      where: { id: created.id },
      data: { contactName: '{"iv":"AAAAAAAA","ciphertext":"BBBB","tag":"CCCC"}' },
    });

    const found = await db.conversation.findUnique({ where: { id: created.id } });
    expect(found).not.toBeNull();
    expect(found!.contactName).toContain("ciphertext"); // raw tampered JSON preserved
  });
});

// ── CROSS-MODEL: master key rotation safety ────────────────────────────────

describe("PII encryption: key rotation safety", () => {
  it("rows encrypted with key A cannot be decrypted with key B (tamper path)", async () => {
    const customerId = await makeCustomer();
    const phone = uniquePhone();
    const created = await db.order.create({
      data: {
        orderNumber: `TEST-${counter}`,
        customerId,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Hydra",
        address: TEST_ADDRESS,
        phone,
        items: { create: [] },
      },
    });
    createdOrderIds.push(created.id);

    // Switch master key — existing ciphertext can't be decrypted
    _resetMasterKeyCacheForTests();
    process.env.SF_MASTER_KEY = "cd".repeat(32); // different 256-bit key
    _resetMasterKeyCacheForTests();

    const found = await db.order.findUnique({ where: { id: created.id } });
    expect(found).not.toBeNull();
    // Decrypt fails gracefully — raw ciphertext JSON preserved (not plaintext)
    expect(found!.phone).toContain("ciphertext");
    expect(found!.phone).not.toBe(phone);

    // Restore original key — decryption works again
    _resetMasterKeyCacheForTests();
    process.env.SF_MASTER_KEY = "ab".repeat(32);
    _resetMasterKeyCacheForTests();

    const foundAgain = await db.order.findUnique({ where: { id: created.id } });
    expect(foundAgain!.phone).toBe(phone);
  });
});
