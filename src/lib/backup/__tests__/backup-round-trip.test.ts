/**
 * Backup round-trip integration test (PROD-006, TEST-010).
 *
 * Tests the critical data-safety path: create backup → mutate DB → restore
 * backup → verify data matches. Was: zero tests for backup/restore (219 LOC
 * at 0% coverage).
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createBackup, restoreBackup, listBackups, deleteBackup, validateBackupFilename } from "../index";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let db = new PrismaClient();

async function cleanDb() {
  await db.$transaction([
    db.orderItem.deleteMany(),
    db.order.deleteMany(),
    db.productVariant.deleteMany(),
    db.product.deleteMany(),
    db.category.deleteMany(),
    db.customer.deleteMany(),
    db.setting.deleteMany(),
    db.counter.deleteMany(),
  ]);
}

async function seedTestData() {
  const cat = await db.category.create({ data: { name: "TestCat" } });
  const product = await db.product.create({
    data: { name: "TestProduct", price: 2500, stock: 50, categoryId: cat.id, isActive: true },
  });
  const customer = await db.customer.create({
    data: { name: "TestCustomer", phone: "0555123456", wilaya: "Alger", commune: "Bab Ezzouar", address: "123 Rue" },
  });
  await db.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  await db.order.create({
    data: {
      orderNumber: "ORD-0001",
      status: "confirmed",
      customerId: customer.id,
      totalPrice: 5000,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      phone: "0555123456",
      source: "manual",
      items: { create: [{ productId: product.id, productName: "TestProduct", quantity: 2, unitPrice: 2500, total: 5000 }] },
    },
  });
}

// Isolate the active-shop DB path so backup/restore operates on the SAME file
// the test's PrismaClient uses. getActiveDbPath() reads data/app-meta.json; if it
// points at the real dev.db (which exists), backup/restore touches dev.db while the
// test queries DATABASE_URL — a mismatch that left restored data invisible.
const DATA_DIR = process.env.SF_DATA_DIR!;
const META_PATH = join(DATA_DIR, "shop-registry.json");

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(
    META_PATH,
    JSON.stringify({
      formatVersion: 2,
      revision: 1,
      workspaceId: "a".repeat(32),
      installationId: "b".repeat(32),
      shops: [{ id: "test", incarnationId: "c".repeat(32), name: "Test", databaseFile: "test.db", icon: null, createdAt: new Date().toISOString() }],
      activeShopId: "test",
    }),
  );
});

describe("backup round-trip (PROD-006)", () => {
  beforeEach(async () => { await cleanDb(); });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await cleanDb();
    await db.$disconnect();
    const backupDir = join(DATA_DIR, "backups");
    if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
  });

  it("createBackup produces a backup file", async () => {
    await seedTestData();
    const result = await createBackup();
    expect(result.filename).toBeTruthy();
    expect(result.size).toBeGreaterThan(0);
  });

  it("listBackups returns created backups", async () => {
    await seedTestData();
    await createBackup();
    const backups = await listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it("restoreBackup restores data after DB is cleared", async () => {
    await seedTestData();
    const backup = await createBackup();
    await cleanDb();
    expect(await db.product.findMany()).toHaveLength(0);
    await db.$disconnect();

    const restoreResult = await restoreBackup(backup.filename);
    expect(restoreResult.success).toBe(true);

    db = new PrismaClient();
    const products = await db.product.findMany();
    expect(products).toHaveLength(1);
    expect(products[0]!.name).toBe("TestProduct");
    expect(products[0]!.price).toBe(2500);

    const customers = await db.customer.findMany();
    expect(customers).toHaveLength(1);
    expect(customers[0]!.name).toBe("TestCustomer");
  });

  it("blocks live production replacement pending supervisor ownership", async () => {
    await seedTestData();
    const backup = await createBackup();
    vi.stubEnv("NODE_ENV", "production");

    await expect(restoreBackup(backup.filename)).rejects.toMatchObject({
      code: "BACKUP_RESTORE_SUPERVISOR_REQUIRED",
    });
    expect(await db.product.count()).toBe(1);
  });

  it("deleteBackup removes the backup file", async () => {
    await seedTestData();
    const backup = await createBackup();
    const before = await listBackups();
    expect(before.length).toBeGreaterThanOrEqual(1);
    await deleteBackup(backup.filename);
    const after = await listBackups();
    expect(after.find((b) => b.filename === backup.filename)).toBeUndefined();
  });

  it("validateBackupFilename rejects path traversal", () => {
    expect(() => validateBackupFilename("../../../etc/passwd")).toThrow();
    expect(() => validateBackupFilename("")).toThrow();
    const valid = validateBackupFilename("sahelflow-backup-test-2026-06-30T12-00-00-000Z.db");
    expect(valid).toBeTruthy();
  });
});
