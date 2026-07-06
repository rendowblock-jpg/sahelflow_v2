/**
 * API route integration test helpers.
 *
 * Calls route handler functions directly with mock Request objects.
 * Uses the real `db` Proxy (with PII encryption) so the test exercises
 * the full route → middleware-equivalent → service → DB path.
 */
process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

/** Raw PrismaClient for test setup/cleanup (same DB as the db Proxy). */
export const rawDb = new PrismaClient();

/** Clean all tables for a fresh test. */
export async function cleanDb(): Promise<void> {
  await rawDb.$transaction([
    rawDb.auditLog.deleteMany(),
    rawDb.session.deleteMany(),
    rawDb.orderItem.deleteMany(),
    rawDb.delivery.deleteMany(),
    rawDb.returnNote.deleteMany(),
    rawDb.return.deleteMany(),
    rawDb.order.deleteMany(),
    rawDb.productVariant.deleteMany(),
    rawDb.product.deleteMany(),
    rawDb.category.deleteMany(),
    rawDb.customer.deleteMany(),
    rawDb.expense.deleteMany(),
    rawDb.counter.deleteMany(),
    rawDb.setting.deleteMany(),
    rawDb.authSecret.deleteMany(),
    rawDb.notification.deleteMany(),
    rawDb.storefrontConfig.deleteMany(),
    rawDb.whatsAppTemplate.deleteMany(),
    rawDb.integration.deleteMany(),
    rawDb.automation.deleteMany(),
    rawDb.aiChatMessage.deleteMany(),
    rawDb.aiChatSession.deleteMany(),
    rawDb.extractionMetric.deleteMany(),
    rawDb.wilayaRiskProfile.deleteMany(),
  ]);
}

let _ipCounter = 0;
/** Get a unique IP for each test (avoids rate limiter accumulation). */
export function uniqueIp(): string {
  _ipCounter++;
  return `192.168.1.${_ipCounter}`;
}

/** Build a mock Request for a POST with JSON body. */
export function mockPost(url: string, body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp(), ...headers },
    body: JSON.stringify(body),
  });
}

/** Build a mock Request for a GET. */
export function mockGet(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, { method: "GET", headers });
}

/** Extract JSON from a Response. */
export async function getJson(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text()) as Record<string, unknown>;
}

/** Seed a storefront config for testing. */
export async function seedStorefront(opts?: { slug?: string; active?: boolean; productIds?: string[] }) {
  return rawDb.storefrontConfig.create({
    data: {
      slug: opts?.slug ?? "test-store",
      name: "Test Store",
      description: "Test store for integration tests",
      theme: JSON.stringify({ template: "minimal", primaryColor: "#0ea5e9", showPrices: true, showStock: true }),
      productIds: JSON.stringify(opts?.productIds ?? []),
      contact: JSON.stringify({ phone: "0555123456", whatsapp: "0555123456" }),
      isActive: opts?.active ?? true,
    },
  });
}

/** Seed a product for testing. */
let _productCounter = 0;
export async function seedProduct(opts?: { name?: string; price?: number; stock?: number }) {
  _productCounter++;
  const category = await rawDb.category.create({ data: { name: `TestCat${_productCounter}` } });
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
