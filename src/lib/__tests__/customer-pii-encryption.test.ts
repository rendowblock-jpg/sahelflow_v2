/**
 * Tests for the Customer PII encryption extension (ADR-003).
 *
 * These hit a real SQLite DB (the dev DB) via the extended `db` client + the
 * raw `dbRaw` client. Each test creates its own customers (cuid IDs) and
 * cleans up, so they're isolated.
 *
 * Coverage:
 *   - create → DB stores ciphertext + blind index; read returns plaintext
 *   - findUnique by plaintext phone (where.phone rewrite)
 *   - findUnique by id returns plaintext
 *   - findMany returns plaintext for all rows
 *   - partial select {phone} auto-fetches phoneEnc + strips it
 *   - partial update (only name) → only name re-encrypted, phone untouched
 *   - update with new phone → blind index + phoneEnc both re-derived
 *   - upsert (create path) → encrypted; (update path) → re-encrypted
 *   - delete by where.phone (plaintext) → works via rewrite
 *   - duplicate phone rejected (unique constraint on blind index)
 *   - tampered ciphertext → decrypt fails gracefully (raw preserved, no crash)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, dbRaw } from "@/lib/db";
import { getMasterKey, _resetMasterKeyCacheForTests } from "@/lib/crypto/master-key";
import { deriveBlindIndex } from "@/lib/crypto/field-crypto";
import { isEncryptedPayload } from "@/lib/crypto/customer-encryption";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Unique-per-run phone generator (avoids collisions with seeded data + flaky
// parallel runs). Format: 0 + 9 digits (valid Algerian mobile shape).
let phoneCounter = 0;
function uniquePhone(): string {
  phoneCounter += 1;
  // 0 + (Date.now() mod 10^8) + counter, padded to 9 digits after the leading 0
  const seed = (Date.now() % 100_000_000) * 100 + phoneCounter;
  return "0" + String(seed).padStart(9, "0").slice(-9);
}
function uniqueName(label: string): string {
  return `Test ${label} ${phoneCounter}`;
}

const TEST_ADDRESS = "12 Rue des Test, Alger";

let tmpDir: string;
const createdIds: string[] = [];
const oldEnv = { ...process.env };

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sf-pii-"));
  _resetMasterKeyCacheForTests();
  process.env.SF_DATA_DIR = tmpDir;
  process.env.SF_MASTER_KEY = "ab".repeat(32); // deterministic 256-bit key
  _resetMasterKeyCacheForTests();
});

afterEach(async () => {
  // Clean up test customers
  if (createdIds.length > 0) {
    await dbRaw.customer.deleteMany({ where: { id: { in: createdIds } } });
  }
  createdIds.length = 0;
  rmSync(tmpDir, { recursive: true, force: true });
  process.env = { ...oldEnv };
  _resetMasterKeyCacheForTests();
});

describe("Customer PII encryption: create + read", () => {
  it("create stores ciphertext + blind index in the DB; read returns plaintext", async () => {
    const phone = uniquePhone();
    const name = uniqueName("Ahmed");
    const created = await db.customer.create({
      data: { name, phone, address: TEST_ADDRESS },
    });
    createdIds.push(created.id);

    // The returned row is already decrypted
    expect(created.name).toBe(name);
    expect(created.phone).toBe(phone);
    expect(created.address).toBe(TEST_ADDRESS);
    expect("phoneEnc" in created).toBe(false);

    // Raw DB stores ciphertext + blind index
    const raw = await dbRaw.customer.findUnique({ where: { id: created.id } });
    expect(raw).not.toBeNull();
    expect(isEncryptedPayload(raw!.name)).toBe(true);
    expect(raw!.name).not.toBe(name);
    expect(raw!.phone).toBe(deriveBlindIndex(phone, getMasterKey()));
    expect(raw!.phone).not.toBe(phone);
    expect(isEncryptedPayload(raw!.phoneEnc!)).toBe(true);
    expect(isEncryptedPayload(raw!.address!)).toBe(true);
  });

  it("findUnique by plaintext phone rewrites where.phone to blind index", async () => {
    const phone = uniquePhone();
    const name = uniqueName("Fatima");
    const created = await db.customer.create({ data: { name, phone } });
    createdIds.push(created.id);

    const found = await db.customer.findUnique({ where: { phone } });
    expect(found).not.toBeNull();
    expect(found!.name).toBe(name);
    expect(found!.phone).toBe(phone);
  });

  it("findMany returns plaintext for all rows + strips phoneEnc", async () => {
    const p1 = uniquePhone();
    const p2 = uniquePhone();
    const c1 = await db.customer.create({ data: { name: uniqueName("A"), phone: p1 } });
    const c2 = await db.customer.create({ data: { name: uniqueName("B"), phone: p2 } });
    createdIds.push(c1.id, c2.id);

    const all = await db.customer.findMany({
      where: { id: { in: [c1.id, c2.id] } },
    });
    expect(all).toHaveLength(2);
    for (const c of all) {
      expect("phoneEnc" in c).toBe(false);
      expect(isEncryptedPayload(c.name)).toBe(false); // plaintext
      expect(c.phone).toMatch(/^0\d{9}$/); // plaintext phone
    }
  });
});

describe("Customer PII encryption: partial select", () => {
  it("select {phone} auto-fetches phoneEnc + decrypts + strips it", async () => {
    const phone = uniquePhone();
    const created = await db.customer.create({
      data: { name: uniqueName("Sel"), phone, address: TEST_ADDRESS },
    });
    createdIds.push(created.id);

    const partial = await db.customer.findUnique({
      where: { id: created.id },
      select: { id: true, phone: true },
    });
    expect(partial).not.toBeNull();
    expect(partial!.phone).toBe(phone); // plaintext, not blind index
    expect("phoneEnc" in partial!).toBe(false); // stripped
    expect("name" in partial!).toBe(false); // not selected
  });

  it("select {id} (no phone) does not fetch phoneEnc", async () => {
    const created = await db.customer.create({
      data: { name: uniqueName("Sel2"), phone: uniquePhone() },
    });
    createdIds.push(created.id);

    const partial = await db.customer.findUnique({
      where: { id: created.id },
      select: { id: true },
    });
    expect(partial).not.toBeNull();
    expect(partial!.id).toBe(created.id);
    expect("phone" in partial!).toBe(false);
    expect("phoneEnc" in partial!).toBe(false);
  });
});

describe("Customer PII encryption: update", () => {
  it("partial update (only name) re-encrypts name, leaves phone untouched", async () => {
    const created = await db.customer.create({
      data: { name: uniqueName("Upd"), phone: uniquePhone() },
    });
    createdIds.push(created.id);
    const rawBefore = await dbRaw.customer.findUnique({ where: { id: created.id } });
    const newName = uniqueName("Renamed");

    await db.customer.update({
      where: { id: created.id },
      data: { name: newName },
    });

    const rawAfter = await dbRaw.customer.findUnique({ where: { id: created.id } });
    expect(rawAfter!.name).not.toBe(rawBefore!.name); // name changed
    expect(isEncryptedPayload(rawAfter!.name)).toBe(true);
    expect(rawAfter!.phone).toBe(rawBefore!.phone); // phone blind index unchanged
    expect(rawAfter!.phoneEnc).toBe(rawBefore!.phoneEnc); // phoneEnc unchanged
  });

  it("updating phone re-derives blind index + phoneEnc", async () => {
    const phone1 = uniquePhone();
    const phone2 = uniquePhone();
    const created = await db.customer.create({
      data: { name: uniqueName("Phn"), phone: phone1 },
    });
    createdIds.push(created.id);

    await db.customer.update({
      where: { id: created.id },
      data: { phone: phone2 },
    });

    const raw = await dbRaw.customer.findUnique({ where: { id: created.id } });
    expect(raw!.phone).toBe(deriveBlindIndex(phone2, getMasterKey()));
    expect(isEncryptedPayload(raw!.phoneEnc!)).toBe(true);

    // Read back via extended client → plaintext
    const found = await db.customer.findUnique({ where: { phone: phone2 } });
    expect(found!.phone).toBe(phone2);
  });
});

describe("Customer PII encryption: upsert", () => {
  it("upsert create path encrypts", async () => {
    const phone = uniquePhone();
    const name = uniqueName("Ups");
    const result = await db.customer.upsert({
      where: { phone },
      create: { name, phone },
      update: { name: uniqueName("Ignored") },
    });
    createdIds.push(result.id);
    expect(result.name).toBe(name);
    expect(result.phone).toBe(phone);

    const raw = await dbRaw.customer.findUnique({ where: { id: result.id } });
    expect(isEncryptedPayload(raw!.name)).toBe(true);
  });

  it("upsert update path re-encrypts", async () => {
    const phone = uniquePhone();
    const created = await db.customer.create({
      data: { name: uniqueName("Orig"), phone },
    });
    createdIds.push(created.id);
    const newName = uniqueName("Updated");

    const result = await db.customer.upsert({
      where: { phone },
      create: { name: uniqueName("Never"), phone },
      update: { name: newName },
    });
    expect(result.name).toBe(newName);
  });
});

describe("Customer PII encryption: constraints + delete", () => {
  it("duplicate phone rejected (unique on blind index)", async () => {
    const phone = uniquePhone();
    const c1 = await db.customer.create({ data: { name: uniqueName("Dup1"), phone } });
    createdIds.push(c1.id);

    await expect(
      db.customer.create({ data: { name: uniqueName("Dup2"), phone } }),
    ).rejects.toThrow();
  });

  it("delete by where.phone (plaintext) works via rewrite", async () => {
    const phone = uniquePhone();
    const created = await db.customer.create({ data: { name: uniqueName("Del"), phone } });
    createdIds.push(created.id); // track in case the delete fails

    await db.customer.delete({ where: { phone } });

    const gone = await db.customer.findUnique({ where: { phone } });
    expect(gone).toBeNull();
    // Successfully deleted — remove from cleanup list
    const idx = createdIds.indexOf(created.id);
    if (idx >= 0) createdIds.splice(idx, 1);
  });
});

describe("Customer PII encryption: tamper resistance", () => {
  it("tampered ciphertext does not crash reads (raw value preserved)", async () => {
    const created = await db.customer.create({
      data: { name: uniqueName("Tamp"), phone: uniquePhone() },
    });
    createdIds.push(created.id);

    // Tamper with the encrypted name directly in the DB
    await dbRaw.customer.update({
      where: { id: created.id },
      data: { name: '{"iv":"AAAAAAAA","ciphertext":"BBBB","tag":"CCCC"}' },
    });

    // Reading should not throw — the extension catches the decrypt error and
    // leaves the raw (tampered) value so corruption is visible
    const found = await db.customer.findUnique({ where: { id: created.id } });
    expect(found).not.toBeNull();
    // The value is the raw tampered JSON (decrypt failed gracefully)
    expect(found!.name).toContain("ciphertext");
  });
});
