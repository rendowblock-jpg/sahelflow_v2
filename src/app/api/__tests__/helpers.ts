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
  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncItemAttempt"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncRunAttempt"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncItem"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncPage"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CommerceSyncRun"');
  await rawDb.$executeRawUnsafe('DELETE FROM "AutomationStepAttempt"');
  await rawDb.$executeRawUnsafe('DELETE FROM "AutomationStepRun"');
  await rawDb.$executeRawUnsafe('DELETE FROM "AutomationRun"');
  await rawDb.$executeRawUnsafe('DELETE FROM "CompensationFact"');
  await rawDb.$executeRawUnsafe('DELETE FROM "ProjectionInvalidation"');
  await rawDb.$executeRawUnsafe('DELETE FROM "FinancialMovement"');
  await rawDb.$executeRawUnsafe('DELETE FROM "InventoryMovement"');
  await rawDb.$executeRawUnsafe('DELETE FROM "InventoryReservation"');
  await rawDb.$executeRawUnsafe('DELETE FROM "OutboxIntent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "DomainEvent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessCommand"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessAggregateVersion"');

  await rawDb.message.deleteMany();
  await rawDb.conversation.deleteMany();
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
  await rawDb.secret.deleteMany();
  // ProtectedKeyAuthority is installation/shop authority, not per-test business
  // data. The canonical db client keeps one authenticated process-bound session,
  // matching packaged runtime semantics; deleting the rows underneath it would
  // manufacture corruption and invalidate unrelated integration tests.
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

/** Build a mock Request for a PATCH with JSON body. */
export function mockPatch(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(url, {
    method: "PATCH",
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
  return (await res.json()) as Record<string, unknown>;
}

/** Seed a minimal active product. */
export async function seedProduct(
  overrides: Partial<{
    name: string;
    sku: string;
    price: number;
    cost: number;
    stock: number;
    lowStockThreshold: number;
  }> = {},
) {
  const category = await rawDb.category.create({
    data: { name: `Test Category ${crypto.randomUUID()}` },
  });
  return rawDb.product.create({
    data: {
      name: overrides.name ?? "Test Product",
      sku: overrides.sku ?? `SKU-${crypto.randomUUID()}`,
      price: overrides.price ?? 2500,
      cost: overrides.cost ?? 1500,
      stock: overrides.stock ?? 100,
      lowStockThreshold: overrides.lowStockThreshold ?? 5,
      categoryId: category.id,
      isActive: true,
    },
  });
}

/** Seed one storefront with the supplied product IDs. */
export async function seedStorefront(
  overrides: Partial<{
    slug: string;
    name: string;
    productIds: string[];
    isActive: boolean;
    active: boolean;
    theme: unknown;
  }> = {},
) {
  return rawDb.storefrontConfig.create({
    data: {
      slug: overrides.slug ?? "test-store",
      name: overrides.name ?? "Test Storefront",
      description: "Test storefront",
      theme: JSON.stringify(overrides.theme ?? { template: "minimal", primaryColor: "#111111" }),
      productIds: JSON.stringify(overrides.productIds ?? []),
      isActive: overrides.isActive ?? overrides.active ?? true,
    },
  });
}
