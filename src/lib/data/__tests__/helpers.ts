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
  "CommerceSyncItemAttempt",
  "CommerceSyncRunAttempt",
  "CommerceSyncItem",
  "CommerceSyncPage",
  "CommerceSyncRun",
  "ProviderCapabilityCertification",
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
    // Secret rows are authenticated by ProtectedKeyAuthority. Treat them as
    // one ownership unit in test cleanup so no later suite inherits an orphaned
    // canonical secret or a wrapping-key row from another test generation.
    db.secret.deleteMany(),
    db.protectedKeyAuthority.deleteMany(),
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
      name,
      phone,
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

export async function cleanDb(db: PrismaClient): Promise<void> {
  await cleanTestDatabase(db);
}

export async function teardownTestPrisma(db?: PrismaClient): Promise<void> {
  if (!db) return;
  await cleanDb(db);
  await db.$disconnect();
}

export function makeContext(db: PrismaClient) {
  return { prisma: db as never, shop: TEST_SHOP_CONTEXT };
}

let phoneCounter = 0;
export function uniquePhone(): string {
  phoneCounter += 1;
  return `0555${String(phoneCounter).padStart(6, "0")}`;
}

export async function seedTestCustomer(
  db: PrismaClient,
  opts?: { name?: string; phone?: string },
) {
  return seedCustomer(db, {
    name: opts?.name,
    phone: opts?.phone ?? uniquePhone(),
  });
}

export async function seedTestProduct(
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
  return seedProduct(db, opts);
}

export async function seedTestOrder(
  db: PrismaClient,
  opts?: {
    customerId?: string;
    status?: string;
    totalPrice?: number;
    createdAt?: Date;
  },
) {
  const customer = opts?.customerId ? null : await seedTestCustomer(db);
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
