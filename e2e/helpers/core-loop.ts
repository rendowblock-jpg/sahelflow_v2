/**
 * Seeding calls shared by the core-loop specs.
 *
 * A manual order is created by POST /api/orders (idempotencyKey plus catalog
 * productIds; the price comes from the catalog) and then moves only through the
 * governed commands: /decision, /fulfillment and /cod/collection. The old
 * PATCH /status refuses these orders (CANONICAL_*_REQUIRED) and PATCH /cod
 * answers 410, so the specs must not use them for orders made here.
 * Every command bumps the order version by one; callers pass the version back.
 */
import { randomUUID } from "node:crypto";

import type { APIRequestContext, APIResponse } from "@playwright/test";

let phoneSeq = 0;

/** A valid Algerian mobile (0[5-7] + 8 digits, 10 in all), unique within a run. */
export function uniquePhone(prefix = "055"): string {
  phoneSeq += 1;
  const width = 10 - prefix.length;
  const tail = String((Date.now() * 10 + (phoneSeq % 10)) % 10 ** width);
  return `${prefix}${tail.padStart(width, "0")}`;
}

async function expectOk(res: APIResponse, what: string): Promise<void> {
  if (res.ok()) return;
  throw new Error(`${what} answered ${res.status()}: ${(await res.text()).slice(0, 400)}`);
}

export async function createProduct(
  api: APIRequestContext,
  opts: { name: string; sku: string; price: number; cost?: number; stock: number },
): Promise<{ id: string; name: string }> {
  const res = await api.post("/api/products", {
    data: { ...opts, cost: opts.cost ?? 1000, lowStockThreshold: 2, isActive: true },
  });
  await expectOk(res, "POST /api/products");
  return (await res.json()).product as { id: string; name: string };
}

export async function createCustomer(
  api: APIRequestContext,
  data: { name: string; phone: string; wilaya: string; commune: string; address: string },
): Promise<{ id: string; phone: string }> {
  const res = await api.post("/api/customers", { data });
  await expectOk(res, "POST /api/customers");
  return (await res.json()).customer as { id: string; phone: string };
}

export interface ManualOrder {
  id: string;
  orderNumber: string;
  version: number;
  totalPrice: number;
}

/**
 * Every product has at least one variant ("Default" when the seller made none), and a manual
 * order must name one exact active variant (manual-order-catalog-line.ts). Specs create their
 * products inline, so the variant is read back here when the caller does not pass one.
 */
export async function resolveVariantId(
  api: APIRequestContext,
  productId: string,
): Promise<string | null> {
  const res = await api.get(`/api/products/${productId}`);
  await expectOk(res, "GET /api/products/:id");
  const body = (await res.json()) as {
    product?: { productVariants?: Array<{ id: string; isActive?: boolean }> };
  };
  const variants = body.product?.productVariants ?? [];
  const active = variants.find((variant) => variant.isActive !== false);
  return active ? active.id : null;
}

/** Creates a manual order; it starts "pending" at version 1. */
export async function createManualOrder(
  api: APIRequestContext,
  opts: {
    customerId: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    wilaya: string;
    commune: string;
    address: string;
    phone: string;
    deliveryCost: number;
    productVariantId?: string | null;
  },
): Promise<ManualOrder> {
  const { unitPrice, productId, quantity, productVariantId, ...rest } = opts;
  const variantId = productVariantId ?? (await resolveVariantId(api, productId));
  const res = await api.post("/api/orders", {
    data: {
      idempotencyKey: randomUUID(),
      ...rest,
      items: [{ productId, quantity, ...(variantId ? { productVariantId: variantId } : {}) }],
      source: "manual",
    },
  });
  await expectOk(res, "POST /api/orders");
  const body = (await res.json()) as {
    order: { id: string; orderNumber: string; version?: number };
  };
  return {
    id: body.order.id,
    orderNumber: body.order.orderNumber,
    version: body.order.version ?? 1,
    totalPrice: unitPrice * quantity + opts.deliveryCost,
  };
}

/** pending -> confirmed (holds the stock). Returns the new version. */
export async function confirmOrder(
  api: APIRequestContext,
  orderId: string,
  version: number,
): Promise<number> {
  const res = await api.post(`/api/orders/${orderId}/decision`, {
    data: { decision: "confirm", expectedVersion: version, idempotencyKey: randomUUID() },
  });
  await expectOk(res, "POST /decision");
  const body = (await res.json()) as { order: { version: number } };
  return body.order.version;
}

/** confirmed -> pack -> ship -> deliver, one step. Returns the new version. */
export async function runFulfillment(
  api: APIRequestContext,
  orderId: string,
  action: "pack" | "ship" | "deliver",
  version: number,
): Promise<number> {
  const res = await api.post(`/api/orders/${orderId}/fulfillment`, {
    data: { action, expectedVersion: version, idempotencyKey: randomUUID() },
  });
  await expectOk(res, `POST /fulfillment ${action}`);
  return version + 1;
}

/** pending -> confirmed -> packed -> shipped -> delivered. Returns the version. */
export async function confirmAndDeliver(
  api: APIRequestContext,
  orderId: string,
  version: number,
): Promise<number> {
  let v = await confirmOrder(api, orderId, version);
  for (const action of ["pack", "ship", "deliver"] as const) {
    v = await runFulfillment(api, orderId, action, v);
  }
  return v;
}

/** Records the cash the courier handed over for a delivered order. */
export async function collectCod(
  api: APIRequestContext,
  orderId: string,
  version: number,
  amount: number,
): Promise<void> {
  const res = await api.post(`/api/orders/${orderId}/cod/collection`, {
    data: {
      expectedVersion: version,
      amount,
      provider: "manual-courier",
      collectedAt: new Date().toISOString(),
      idempotencyKey: randomUUID(),
    },
  });
  await expectOk(res, "POST /cod/collection");
}
