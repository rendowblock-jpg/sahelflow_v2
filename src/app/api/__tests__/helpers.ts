/**
 * API route integration test helpers.
 *
 * Calls route handlers directly and uses the same SQLite database as the
 * application Prisma proxy.
 */
process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

export const rawDb = new PrismaClient();

/** Clean all tables for a fresh test, including raw canonical authority tables. */
export async function cleanDb(): Promise<void> {
  await rawDb.$executeRawUnsafe('DELETE FROM "CompensationFact"');
  await rawDb.$executeRawUnsafe('DELETE FROM "ProjectionInvalidation"');
  await rawDb.$executeRawUnsafe('DELETE FROM "FinancialMovement"');
  await rawDb.$executeRawUnsafe('DELETE FROM "InventoryMovement"');
  await rawDb.$executeRawUnsafe('DELETE FROM "InventoryReservation"');
  await rawDb.$executeRawUnsafe('DELETE FROM "OutboxIntent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "DomainEvent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessCommand"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessAggregateVersion"');

  await rawDb.$transaction([
    rawDb.auditLog.deleteMany(),
    rawDb.session.deleteMany(),
    rawDb.orderItem.deleteMany(),
    rawDb.delivery.deleteMany(),
    rawDb.returnNote.deleteMany(),
    rawDb.return.deleteMany(),
    rawDb.refund.deleteMany(),
    rawDb.orderChange.deleteMany(),
    rawDb.order.deleteMany(),
    rawDb.productVariant.deleteMany(),
    rawDb.product.deleteMany(),
    rawDb.category.deleteMany(),
    rawDb.customer.deleteMany(),
    rawDb.expense.deleteMany(),
    rawDb.counter.deleteMany(),
    rawDb.setting.deleteMany(),
    rawDb.authSecret.deleteMany(),
    rawDb.storefrontConfig.deleteMany(),
    rawDb.whatsAppTemplate.deleteMany(),
    rawDb.integration.deleteMany(),
    rawDb.automationLog.deleteMany(),
    rawDb.automation.deleteMany(),
    rawDb.aiChatMessage.deleteMany(),
    rawDb.aiChatSession.deleteMany(),
    rawDb.extractionMetric.deleteMany(),
    rawDb.wilayaRiskProfile.deleteMany(),
  ]);
}

let ipCounter = 0;
export function uniqueIp(): string {
  ipCounter += 1;
  return `192.168.1.${ipCounter}`;
}

export function mockPost(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": uniqueIp(),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export function mockGet(
  url: string,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(url, { method: "GET", headers });
}

export async function getJson(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text()) as Record<string, unknown>;
}

export async function seedStorefront(opts?: {
  slug?: string;
  active?: boolean;
  productIds?: string[];
}) {
  return rawDb.storefrontConfig.create({
    data: {
      slug: opts?.slug ?? "test-store",
      name: "Test Store",
      description: "Test store for integration tests",
      theme: JSON.stringify({
        template: "minimal",
        primaryColor: "#0ea5e9",
        showPrices: true,
        showStock: true,
      }),
      productIds: JSON.stringify(opts?.productIds ?? []),
      contact: JSON.stringify({
        phone: "0555123456",
        whatsapp: "0555123456",
      }),
      isActive: opts?.active ?? true,
    },
  });
}

let productCounter = 0;
export async function seedProduct(opts?: {
  name?: string;
  price?: number;
  stock?: number;
}) {
  productCounter += 1;
  const category = await rawDb.category.create({
    data: { name: `TestCat${productCounter}` },
  });
  return rawDb.product.create({
    data: {
      name: opts?.name ?? "Test Product",
      price: opts?.price ?? 2500,
      stock: opts?.stock ?? 100,
      categoryId: category.id,
      isActive: true,
    },
  });
}
