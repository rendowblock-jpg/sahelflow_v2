/**
 * Shared test helpers for service-layer tests.
 *
 * Creates a clean PrismaClient + provides seed helpers.
 * Tests pass a raw Prisma client (the PII encryption extension is tested
 * separately) together with a deterministic explicit ShopContext.
 */
import { PrismaClient } from "@prisma/client";
import { deriveBlindIndex } from "@/lib/crypto/field-crypto";
import type { ShopContext } from "@/lib/shops/context";

// Set the master key for PII encryption (required by db.ts)
process.env.SF_MASTER_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export const TEST_SHOP_CONTEXT: ShopContext = Object.freeze({
  workspaceId: "a".repeat(32),
  installationId: "b".repeat(32),
  shopId: "test",
  shopIncarnationId: "c".repeat(32),
  registryRevision: 1,
  databaseFileId: "test.db",
  migrationSetSha256: "0".repeat(64),
});

function testKey(): Buffer {
  return Buffer.from(process.env.SF_MASTER_KEY!, "hex");
}

const CANONICAL_FACT_TABLES = [
  "CanonicalRefundReversal",
  "CanonicalRefund",
  "CanonicalExchangeOrder",
  "CanonicalExchangeRequestItem",
  "CanonicalExchangeRequest",
  "CanonicalReturnInspection",
  "CanonicalReturnEvent",
  "CanonicalReturnItem",
  "CanonicalReturnCase",
  "CanonicalDeliveryEvent",
  "CodSettlementLineMatch",
  "CodSettlementCorrection",
  "CodSettlementLine",
  "CodSettlement",
  "CodCollectionCorrection",
  "CodCollection",
  // Task 5 approval/execution children must be deleted before proposals and
  // chat sessions because the migration intentionally keeps strict FKs.
  "AiActionExecution",
  "AiActionApproval",
  "AiActionProposal",
  "WhatsAppOutboundEffect",
  "CompensationFact",
  "ProjectionInvalidation",
  "FinancialMovement",
  "InventoryMovement",
  "InventoryReservation",
  "OutboxIntent",
  "DomainEvent",
  "BusinessCommand",
  "BusinessAggregateVersion",
] as const;

async function cleanTestDatabase(db: PrismaClient): Promise<void> {
  // Canonical append-only facts must be removed before the legacy projections
  // they reference. These tables are intentionally accessed through static SQL
  // so this helper keeps working while Prisma relation fields remain minimal.
  for (const table of CANONICAL_FACT_TABLES) {
    await db.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }

  await db.$transaction([
    db.auditLog.deleteMany(),
    db.session.deleteMany(),
    db.message.deleteMany(),
    db.conversation.deleteMany(),
    db.returnNote.deleteMany(),
    db.orderChange.deleteMany(),
    db.refund.deleteMany(),
    db.return.deleteMany(),
    db.delivery.deleteMany(),
    db.orderItem.deleteMany(),
    db.order.deleteMany(),
    db.productVariant.deleteMany(),
    db.product.deleteMany(),
    db.category.deleteMany(),
    db.customer.deleteMany(),
    db.expense.deleteMany(),
    db.counter.deleteMany(),
    db.setting.deleteMany(),
    db.authSecret.deleteMany(),
    db.storefrontConfig.deleteMany(),
    db.whatsAppTemplate.deleteMany(),
    db.integration.deleteMany(),
    db.automationLog.deleteMany(),
    db.automation.deleteMany(),
    db.aiChatMessage.deleteMany(),
    db.aiChatSession.deleteMany(),
    db.extractionMetric.deleteMany(),
    db.wilayaRiskProfile.deleteMany(),
    db.phoneReputation.deleteMany(),
  ]);
}

export async function createTestPrisma(): Promise<PrismaClient> {
  const db = new PrismaClient();
  await cleanTestDatabase(db);
  return db;
}

export async function disconnectTestPrisma(db?: PrismaClient): Promise<void> {
  if (!db) return;
  await db.$disconnect();
}

export async function seedCategory(db: PrismaClient, name = "Electronics") {
  return db.category.create({ data: { name } });
}

export async function seedProduct(
  db: PrismaClient,
  opts?: {
    name?: string;
    price?: number;
    stock?: number;
    lowStockThreshold?: number;
    categoryId?: string;
    sku?: string;
  },
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
  opts?: {
    customerId?: string;
    productId?: string;
    status?: string;
    totalPrice?: number;
  },
) {
  const customer = opts?.customerId ? null : await seedCustomer(db);
  const customerId = opts?.customerId ?? customer!.id;

  const product = opts?.productId ? null : await seedProduct(db);

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
            create: [
              {
                productId: opts.productId,
                productName: "Test Product",
                quantity: 2,
                unitPrice: 2500,
                total: 5000,
              },
            ],
          }
        : product
          ? {
              create: [
                {
                  productId: product.id,
                  productName: "Test Product",
                  quantity: 2,
                  unitPrice: 2500,
                  total: 5000,
                },
              ],
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
  await cleanTestDatabase(db);
}

/** Disconnect + clean (alias for disconnectTestPrisma). Tolerates no-arg calls. */
export async function teardownTestPrisma(db?: PrismaClient): Promise<void> {
  if (!db) return;
  await cleanDb(db);
  await db.$disconnect();
}

/** Build a ServiceContext from a PrismaClient. */
export function makeContext(db: PrismaClient) {
  return { prisma: db as never, shop: TEST_SHOP_CONTEXT };
}

/** Generate a unique phone number for tests (avoids unique constraint conflicts). */
export function uniquePhone(): string {
  const suffix = Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, "0");
  return `055${suffix}`;
}
