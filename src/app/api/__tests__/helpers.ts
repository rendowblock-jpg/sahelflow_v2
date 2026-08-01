/**
 * API route integration test helpers.
 *
 * Calls route handler functions directly with mock Request objects.
 * Uses the real `db` Proxy (with PII encryption) so the test exercises
 * the route → service → DB path. Direct business-route tests carry one
 * request-scoped test authority header; authentication-specific tests still
 * exercise real session authority as soon as AuthSecret is configured.
 */
process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY = "vitest-business-routes";

import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

export const DIRECT_ROUTE_TEST_AUTH_HEADER =
  "x-sahelflow-direct-route-test-authority";
export const DIRECT_ROUTE_TEST_AUTH_VALUE = "vitest-business-route";

/** Raw PrismaClient for test setup/cleanup (same DB as the db Proxy). */
export const rawDb = new PrismaClient();

/** Clean all tables for a fresh test in foreign-key-safe authority order. */
export async function cleanDb(): Promise<void> {
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalRefundReversal"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalRefund"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalExchangeOrder"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalExchangeRequestItem"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalExchangeRequest"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalReturnInspection"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalReturnEvent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalReturnItem"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalReturnCase"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CanonicalDeliveryEvent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CodSettlementLineMatch"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CodSettlementCorrection"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CodSettlementLine"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CodSettlement"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CodCollectionCorrection"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CodCollection"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CollaborationMention"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CollaborationComment"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CollaborationHandover"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CollaborationAssignment"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CollaborationQueue"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CollaborationWorkgroupMember"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CollaborationWorkgroup"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CompensationFact"');
  await rawDb.$executeRawUnsafe('DELETE FROM "ProjectionInvalidation"');
  await rawDb.$executeRawUnsafe('DELETE FROM "FinancialMovement"');
  await rawDb.$executeRawUnsafe('DELETE FROM "InventoryMovement"');
  await rawDb.$executeRawUnsafe('DELETE FROM "InventoryReservation"');
  await rawDb.$executeRawUnsafe('DELETE FROM "OutboxIntent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "DomainEvent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessCommand"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessAggregateVersion"');

  await rawDb.auditLog.deleteMany();
  await rawDb.session.deleteMany();
  await rawDb.returnNote.deleteMany();
  await rawDb.orderChange.deleteMany();
  await rawDb.refund.deleteMany();
  await rawDb.return.deleteMany();
  await rawDb.delivery.deleteMany();
  await rawDb.orderItem.deleteMany();
  await rawDb.order.deleteMany();
  await rawDb.productVariant.deleteMany();
  await rawDb.product.deleteMany();
  await rawDb.category.deleteMany();
  await rawDb.customer.deleteMany();
  await rawDb.expense.deleteMany();
  await rawDb.counter.deleteMany();
  await rawDb.setting.deleteMany();
  await rawDb.authSecret.deleteMany();
  await rawDb.storefrontConfig.deleteMany();
  await rawDb.whatsAppTemplate.deleteMany();
  await rawDb.integration.deleteMany();
  await rawDb.automationLog.deleteMany();
  await rawDb.automation.deleteMany();
  await rawDb.aiChatMessage.deleteMany();
  await rawDb.aiChatSession.deleteMany();
  await rawDb.extractionMetric.deleteMany();
  await rawDb.wilayaRiskProfile.deleteMany();
}

let _ipCounter = 0;
/** Get a unique IP for each test (avoids rate limiter accumulation). */
export function uniqueIp(): string {
  _ipCounter += 1;
  return `192.168.1.${_ipCounter}`;
}

function directRouteHeaders(
  headers?: Record<string, string>,
): Record<string, string> {
  return {
    [DIRECT_ROUTE_TEST_AUTH_HEADER]: DIRECT_ROUTE_TEST_AUTH_VALUE,
    ...headers,
  };
}

/** Build a mock Request for a POST with JSON body. */
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
      ...directRouteHeaders(headers),
    },
    body: JSON.stringify(body),
  });
}

/** Build a mock Request for a GET. */
export function mockGet(
  url: string,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers: directRouteHeaders(headers),
  });
}

/** Extract JSON from a Response. */
export async function getJson(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text()) as Record<string, unknown>;
}

/** Seed a storefront config for testing. */
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

/** Seed a product for testing. */
let _productCounter = 0;
export async function seedProduct(opts?: {
  name?: string;
  price?: number;
  stock?: number;
}) {
  _productCounter += 1;
  const category = await rawDb.category.create({
    data: { name: `TestCat${_productCounter}` },
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
