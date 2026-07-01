/**
 * Shared test helpers for service-layer tests.
 *
 * Creates a clean PrismaClient + provides seed helpers.
 * The services accept ServiceContext = { prisma: PrismaClient }, so we pass
 * the raw client directly (the PII encryption extension is tested separately).
 */
import { PrismaClient } from "@prisma/client";
import { deriveBlindIndex } from "@/lib/crypto/field-crypto";

// Set the master key for PII encryption (required by db.ts)
process.env.SF_MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function testKey(): Buffer {
  return Buffer.from(process.env.SF_MASTER_KEY!, "hex");
}

export async function createTestPrisma(): Promise<PrismaClient> {
  const db = new PrismaClient();
  // Clean all tables (order matters for FK constraints)
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.session.deleteMany(),
    db.orderItem.deleteMany(),
    db.delivery.deleteMany(),
    db.returnNote.deleteMany(),
    db.return.deleteMany(),
    db.order.deleteMany(),
    db.productVariant.deleteMany(),
    db.product.deleteMany(),
    db.category.deleteMany(),
    db.customer.deleteMany(),
    db.expense.deleteMany(),
    db.counter.deleteMany(),
    db.setting.deleteMany(),
    db.authSecret.deleteMany(),
  ]);
  return db;
}

export async function disconnectTestPrisma(db: PrismaClient): Promise<void> {
  await db.$disconnect();
}

export async function seedCategory(db: PrismaClient, name = "Electronics") {
  return db.category.create({ data: { name } });
}

export async function seedProduct(
  db: PrismaClient,
  opts?: { name?: string; price?: number; stock?: number; lowStockThreshold?: number; categoryId?: string; sku?: string },
) {
  const categoryId = opts?.categoryId ?? (await seedCategory(db)).id;
  return db.product.create({
    data: {
      name: opts?.name ?? "Test Product",
      price: opts?.price ?? 2500,
      stock: opts?.stock ?? 100,
      lowStockThreshold: opts?.lowStockThreshold ?? 5,
      sku: opts?.sku ?? null,
      categoryId,
      isActive: true,
    },
  });
}

export async function seedCustomer(
  db: PrismaClient,
  opts?: { name?: string; phone?: string },
) {
  const name = opts?.name ?? "Ahmed Benali";
  const phone = opts?.phone ?? "0555123456";
  return db.customer.create({
    data: {
      name, // plaintext (tests use raw client, no PII extension)
      phone, // plaintext (tests use raw client; production uses blind index via PII extension)
      nameBlindIndex: deriveBlindIndex(name.toLowerCase().trim(), testKey()),
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
    },
  });
}

export async function seedOrder(
  db: PrismaClient,
  opts?: { customerId?: string; productId?: string; status?: string; totalPrice?: number },
) {
  const customer = opts?.customerId
    ? null
    : await seedCustomer(db);
  const customerId = opts?.customerId ?? customer!.id;

  const product = opts?.productId
    ? null
    : await seedProduct(db);

  const counter = await db.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  const orderNumber = `ORD-${String(counter.value).padStart(4, "0")}`;

  return db.order.create({
    data: {
      orderNumber,
      status: opts?.status ?? "draft",
      customerId,
      totalPrice: opts?.totalPrice ?? 5000,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: "manual",
      items: opts?.productId
        ? {
            create: [{
              productId: opts.productId,
              productName: "Test Product",
              quantity: 2,
              unitPrice: 2500,
              total: 5000,
            }],
          }
        : product
          ? {
              create: [{
                productId: product.id,
                productName: "Test Product",
                quantity: 2,
                unitPrice: 2500,
                total: 5000,
              }],
            }
          : undefined,
    },
    include: { items: true },
  });
}

// ── Aliases for the subagent-written tests (compatibility layer) ─────────────
// These match the helper API the subagent tests expect.

/** Clean all tables in the test DB (alias for createTestPrisma's cleanup). */
export async function cleanDb(db: PrismaClient): Promise<void> {
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.session.deleteMany(),
    db.orderItem.deleteMany(),
    db.delivery.deleteMany(),
    db.returnNote.deleteMany(),
    db.return.deleteMany(),
    db.order.deleteMany(),
    db.productVariant.deleteMany(),
    db.product.deleteMany(),
    db.category.deleteMany(),
    db.customer.deleteMany(),
    db.expense.deleteMany(),
    db.counter.deleteMany(),
    db.setting.deleteMany(),
    db.authSecret.deleteMany(),
  ]);
}

/** Disconnect + clean (alias for disconnectTestPrisma). Tolerates no-arg calls. */
export async function teardownTestPrisma(db?: PrismaClient): Promise<void> {
  if (!db) return;
  await cleanDb(db);
  await db.$disconnect();
}

/** Build a ServiceContext from a PrismaClient. */
export function makeContext(db: PrismaClient) {
  return { prisma: db };
}

/** Generate a unique phone number for tests (avoids unique constraint conflicts). */
let _phoneCounter = 0;
export function uniquePhone(): string {
  _phoneCounter++;
  const suffix = String(_phoneCounter).padStart(6, "0");
  return `0555${suffix}`;
}

/** Alias: seedTestCustomer (matches subagent test API). */
export async function seedTestCustomer(
  db: PrismaClient,
  opts?: { name?: string; phone?: string },
) {
  return seedCustomer(db, {
    name: opts?.name,
    phone: opts?.phone ?? uniquePhone(),
  });
}

/** Alias: seedTestProduct (matches subagent test API). */
export async function seedTestProduct(
  db: PrismaClient,
  opts?: { name?: string; price?: number; stock?: number; lowStockThreshold?: number; categoryId?: string; sku?: string },
) {
  return seedProduct(db, opts);
}

/** Alias: seedTestOrder (matches subagent test API). */
export async function seedTestOrder(
  db: PrismaClient,
  opts?: { customerId?: string; status?: string; totalPrice?: number; createdAt?: Date },
) {
  const customer = opts?.customerId
    ? null
    : await seedTestCustomer(db);
  const customerId = opts?.customerId ?? customer!.id;

  const counter = await db.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  const orderNumber = `ORD-${String(counter.value).padStart(4, "0")}`;

  return db.order.create({
    data: {
      orderNumber,
      status: opts?.status ?? "draft",
      customerId,
      totalPrice: opts?.totalPrice ?? 5000,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: "manual",
      ...(opts?.createdAt ? { createdAt: opts.createdAt } : {}),
    },
    include: { items: true },
  });
}

