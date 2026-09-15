/**
 * FD-061 EX-4 sandbox DB tests for the abandoned-cart recovery service.
 *
 * The slice's contract battery: capture validation (DZ mobile
 * `^[567]\d{8}$` after 00213/213/0 stripping), per-session upsert
 * (UNIQUE (storefrontSlug, sessionId)), converted-terminal idempotency,
 * re-arming an abandoned session, the 30-minute sweep boundary, the
 * fire-and-forget capture route (beacon content type) and the recovery
 * stats sums. All cases run against the real SQLite schema.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { z } from "zod";

import {
  canonicalCapturedPhone,
  captureSchema,
  convertAbandonedCart,
  getAbandonedCartRecoveryStats,
  markStaleCartsAbandoned,
  upsertAbandonedCartCapture,
} from "@/lib/storefront/abandoned-cart-service";
import { POST as captureRoute } from "@/app/api/storefront/cart-capture/route";
import {
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
  seedProduct,
} from "@/lib/data/__tests__/helpers";
import type { ServiceContext } from "@/lib/data/service-base";

let db: PrismaClient;
let context: ServiceContext;

beforeEach(async () => {
  db = await createTestPrisma();
  // The shared cleaner predates the EX-4 recovery ledger; clear it
  // explicitly so every case starts from an empty ledger.
  await db.abandonedCart.deleteMany();
  context = makeContext(db);
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

const SESSION = "22222222-2222-4222-8222-222222222222";
const SLUG = "recovery-store";
let seededProductId = "seeded-below";

async function seedCatalog() {
  const product = await seedProduct(db, { price: 2500 });
  seededProductId = product.id;
  await db.storefrontConfig.create({
    data: {
      slug: SLUG,
      name: "Recovery Storefront",
      theme: JSON.stringify({ template: "minimal", primaryColor: "#111111" }),
      productIds: JSON.stringify([product.id]),
      isActive: true,
    },
  });
  return product;
}

/** Build a schema-valid capture input for the seeded catalog. */
function captureInput(
  overrides: Partial<z.input<typeof captureSchema>> = {},
): z.input<typeof captureSchema> {
  return {
    slug: SLUG,
    sessionId: SESSION,
    name: "Recovery Visitor",
    phone: "0555123456",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "1 Recovery Street",
    items: [{ productId: seededProductId, quantity: 2 }],
    ...overrides,
  };
}

describe("abandoned-cart capture validation", () => {
  it("accepts the research phone contract after 00213/213/0 stripping", () => {
    expect(canonicalCapturedPhone("0555123456")).toBe("555123456");
    expect(canonicalCapturedPhone("00213555123456")).toBe("555123456");
    expect(canonicalCapturedPhone("213555123456")).toBe("555123456");
    expect(canonicalCapturedPhone("+213 555 123 456")).toBe("555123456");
    expect(canonicalCapturedPhone("0412345678")).toBeNull();
    expect(canonicalCapturedPhone("055512345")).toBeNull();
    expect(canonicalCapturedPhone("")).toBeNull();
  });

  it("applies the zod capture schema exactly", () => {
    expect(captureSchema.safeParse(captureInput({ name: "A" })).success).toBe(
      false,
    );
    expect(
      captureSchema.safeParse(captureInput({ sessionId: "short" })).success,
    ).toBe(false);
    expect(
      captureSchema.safeParse(captureInput({ items: [] })).success,
    ).toBe(false);
    expect(captureSchema.safeParse(captureInput()).success).toBe(true);
  });

  it("skips captures with an invalid phone at the service boundary", async () => {
    await seedCatalog();
    expect(
      await upsertAbandonedCartCapture(
        context,
        captureSchema.parse(captureInput({ phone: "0412345678" })),
      ),
    ).toMatchObject({ captured: false, reason: "invalid_phone" });
    expect(await db.abandonedCart.count()).toBe(0);
  });
});

describe("abandoned-cart capture upsert lifecycle", () => {
  it("captures with live-catalog prices and upserts per session", async () => {
    const product = await seedCatalog();

    const first = await upsertAbandonedCartCapture(
      context,
      captureSchema.parse(
        captureInput({ items: [{ productId: product.id, quantity: 2 }] }),
      ),
    );
    expect(first).toEqual({ captured: true });

    const row = await db.abandonedCart.findUnique({
      where: {
        storefrontSlug_sessionId: { storefrontSlug: SLUG, sessionId: SESSION },
      },
    });
    expect(row).toMatchObject({
      status: "pending",
      itemCount: 2,
      totalPrice: 5000,
      customerPhone: "555123456",
      abandonedAt: null,
      convertedOrderId: null,
    });

    // Second capture for the same session refreshes in place (no second row).
    const second = await upsertAbandonedCartCapture(
      context,
      captureSchema.parse(
        captureInput({
          items: [{ productId: product.id, quantity: 1 }],
          name: "Recovery Visitor II",
        }),
      ),
    );
    expect(second).toEqual({ captured: true });
    const rows = await db.abandonedCart.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      itemCount: 1,
      totalPrice: 2500,
      customerName: "Recovery Visitor II",
    });
  });

  it("skips captures for missing or inactive storefronts and dead products", async () => {
    const product = await seedCatalog();
    await db.storefrontConfig.update({
      where: { slug: SLUG },
      data: { isActive: false },
    });
    expect(
      await upsertAbandonedCartCapture(context, captureSchema.parse(captureInput())),
    ).toMatchObject({ captured: false, reason: "storefront_missing_or_inactive" });

    await db.storefrontConfig.update({
      where: { slug: SLUG },
      data: { isActive: true },
    });
    expect(
      await upsertAbandonedCartCapture(
        context,
        captureSchema.parse(
          captureInput({ items: [{ productId: "nope", quantity: 1 }] }),
        ),
      ),
    ).toMatchObject({ captured: false, reason: "product_unavailable" });
    void product;
  });

  it("converts once and never resurrects a converted session", async () => {
    const product = await seedCatalog();
    await upsertAbandonedCartCapture(context, captureSchema.parse(captureInput()));
    const customer = await db.customer.create({
      data: { name: "Recovery Customer", phone: "0555999888" },
    });
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-RECOVERY-1",
        status: "pending",
        version: 1,
        fulfillmentState: "unfulfilled",
        deliveryState: "not_created",
        inventoryState: "unreserved",
        codState: "not_expected",
        customerId: customer.id,
        totalPrice: 5000,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "1 Recovery Street",
        phone: "0555123456",
        source: "storefront",
        sourceOrderId: "recovery-1",
        sourceMetadata: "{}",
      },
    });

    expect(
      await convertAbandonedCart(context, {
        slug: SLUG,
        sessionId: SESSION,
        orderId: order.id,
      }),
    ).toBe(1);
    // Idempotent: a replay (or the debounced capture racing the checkout)
    // converts nothing more.
    expect(
      await convertAbandonedCart(context, {
        slug: SLUG,
        sessionId: SESSION,
        orderId: order.id,
      }),
    ).toBe(0);

    expect(
      await upsertAbandonedCartCapture(context, captureSchema.parse(captureInput())),
    ).toMatchObject({ captured: false, reason: "already_converted" });

    const row = await db.abandonedCart.findUnique({
      where: {
        storefrontSlug_sessionId: { storefrontSlug: SLUG, sessionId: SESSION },
      },
    });
    expect(row).toMatchObject({ status: "converted", convertedOrderId: order.id });
    void product;
  });

  it("re-arms an abandoned session on renewed activity", async () => {
    await seedCatalog();
    await upsertAbandonedCartCapture(context, captureSchema.parse(captureInput()));
    // Force the row past the sweep window, then sweep.
    await db.abandonedCart.updateMany({
      data: { capturedAt: new Date(Date.now() - 31 * 60_000) },
    });
    expect(await markStaleCartsAbandoned(context)).toBe(1);

    // The visitor returns: the capture re-arms the sweep from now.
    const renewed = await upsertAbandonedCartCapture(
      context,
      captureSchema.parse(captureInput()),
    );
    expect(renewed).toEqual({ captured: true });
    const row = await db.abandonedCart.findUnique({
      where: {
        storefrontSlug_sessionId: { storefrontSlug: SLUG, sessionId: SESSION },
      },
    });
    expect(row).toMatchObject({ status: "pending", abandonedAt: null });
  });
});

describe("the 30-minute sweep boundary", () => {
  it("marks only pending rows older than 30 minutes and leaves fresh ones", async () => {
    await seedCatalog();
    const freshSession = "33333333-3333-4333-8333-333333333333";
    await upsertAbandonedCartCapture(context, captureSchema.parse(captureInput()));
    await upsertAbandonedCartCapture(
      context,
      captureSchema.parse(captureInput({ sessionId: freshSession })),
    );
    await db.abandonedCart.update({
      where: {
        storefrontSlug_sessionId: { storefrontSlug: SLUG, sessionId: SESSION },
      },
      data: { capturedAt: new Date(Date.now() - 30 * 60_000 - 1_000) },
    });

    expect(await markStaleCartsAbandoned(context)).toBe(1);
    const statuses = await db.abandonedCart.findMany({
      select: { sessionId: true, status: true },
    });
    expect(statuses).toContainEqual({ sessionId: SESSION, status: "abandoned" });
    expect(statuses).toContainEqual({ sessionId: freshSession, status: "pending" });

    // Sweeping again is idempotent — abandoned rows are not re-touched.
    expect(await markStaleCartsAbandoned(context)).toBe(0);
  });
});

describe("recovery stats", () => {
  it("sums counts and estimated lost / recovered revenue", async () => {
    const product = await seedCatalog();
    // pending
    await upsertAbandonedCartCapture(context, captureSchema.parse(captureInput()));
    // abandoned x2 (5000 each)
    for (const sessionId of [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ]) {
      await upsertAbandonedCartCapture(
        context,
        captureSchema.parse(
          captureInput({
            sessionId,
            items: [{ productId: product.id, quantity: 2 }],
          }),
        ),
      );
    }
    await db.abandonedCart.updateMany({
      where: {
        sessionId: {
          in: [
            "44444444-4444-4444-8444-444444444444",
            "55555555-5555-4555-8555-555555555555",
          ],
        },
      },
      data: { status: "abandoned", abandonedAt: new Date() },
    });
    // converted (2500)
    const convertedSession = "66666666-6666-4666-8666-666666666666";
    await upsertAbandonedCartCapture(
      context,
      captureSchema.parse(
        captureInput({
          sessionId: convertedSession,
          items: [{ productId: seededProductId, quantity: 1 }],
        }),
      ),
    );
    await db.abandonedCart.update({
      where: {
        storefrontSlug_sessionId: {
          storefrontSlug: SLUG,
          sessionId: convertedSession,
        },
      },
      data: { status: "converted", convertedAt: new Date() },
    });

    expect(await getAbandonedCartRecoveryStats(context)).toEqual({
      pending: 1,
      abandoned: 2,
      converted: 1,
      estimatedLostRevenue: 10000,
      recoveredRevenue: 2500,
    });
  });
});

describe("the public capture route", () => {
  it("accepts a beacon-style text/plain capture and returns 204", async () => {
    const product = await seedCatalog();
    const request = new Request("http://localhost/api/storefront/cart-capture", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(
        captureInput({ items: [{ productId: product.id, quantity: 1 }] }),
      ),
    });
    const response = await captureRoute(request as never);
    expect(response.status).toBe(204);
    expect(await db.abandonedCart.count()).toBe(1);
  });

  it("swallows malformed payloads with a 204 (fire-and-forget contract)", async () => {
    await seedCatalog();
    const request = new Request("http://localhost/api/storefront/cart-capture", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: "{not json",
    });
    const response = await captureRoute(request as never);
    expect(response.status).toBe(204);
    expect(await db.abandonedCart.count()).toBe(0);
  });
});
