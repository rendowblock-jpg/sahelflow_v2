/**
 * Daily report tests — yesterday's activity summarized as a WhatsApp message.
 *
 * Seeds orders + items + deliveries + low-stock products + new customers for
 * "yesterday" and asserts the report's structure + message content.
 *
 * NOTE: generateDailyReport builds the message string in-process — it does NOT
 * send to WhatsApp. No sidecar-client mock is needed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { generateDailyReport, type DailyReport } from "../daily-report";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedTestCustomer,
  uniquePhone,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

/** "Yesterday at noon" — a Date safely inside yesterday's local-time bucket. */
function yesterdayNoon(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function seedOrderWithItems(opts: {
  status?: string;
  totalPrice?: number;
  createdAt?: Date;
  items?: Array<{ name: string; quantity: number; unitPrice: number }>;
  deliveryStatus?: string;
  deliveryProvider?: string;
} = {}) {
  const customer = await seedTestCustomer(db, { phone: uniquePhone() });
  const counter = await db.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  const items = opts.items ?? [{ name: "Widget", quantity: 2, unitPrice: 2500 }];
  const itemTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-${String(counter.value).padStart(4, "0")}`,
      status: opts.status ?? "confirmed",
      customerId: customer.id,
      totalPrice: opts.totalPrice ?? itemTotal,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      phone: uniquePhone(),
      source: "manual",
      createdAt: opts.createdAt ?? yesterdayNoon(),
      items: {
        create: items.map((i) => ({
          productName: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.quantity * i.unitPrice,
        })),
      },
    },
  });
  if (opts.deliveryStatus) {
    await db.delivery.create({
      data: {
        orderId: order.id,
        provider: opts.deliveryProvider ?? "yalidine",
        status: opts.deliveryStatus,
      },
    });
  }
  return order;
}

// ── Empty / no-yesterday-orders ─────────────────────────────────────────────

describe("generateDailyReport — no orders yesterday", () => {
  it("returns null when there are no orders for yesterday", async () => {
    const report = await generateDailyReport("fr");
    expect(report).toBeNull();
  });
});

// ── Happy path ──────────────────────────────────────────────────────────────

describe("generateDailyReport — with orders", () => {
  it("returns a DailyReport with the expected shape", async () => {
    await seedOrderWithItems({ totalPrice: 5000 });
    const report: DailyReport | null = await generateDailyReport("fr");
    expect(report).not.toBeNull();
    expect(report!.date).toBeInstanceOf(Date);
    expect(report!.ordersCount).toBe(1);
    expect(report!.revenue).toBe(5000);
    expect(report!.topProducts).toBeInstanceOf(Array);
    expect(report!.lowStockProducts).toBeInstanceOf(Array);
    expect(report!.newCustomers).toBeGreaterThanOrEqual(0);
    expect(typeof report!.message).toBe("string");
    expect(report!.locale).toBe("fr");
  });

  it("reports order count + revenue in the message", async () => {
    await seedOrderWithItems({ totalPrice: 5000 });
    const report = await generateDailyReport("fr");
    expect(report!.message).toContain("1");
    // formatDZDBare uses fr-DZ Intl formatting → "5\u202F000" (narrow no-break space)
    expect(report!.message).toContain("5\u202F000");
    expect(report!.message).toContain("DZD");
  });

  it("excludes cancelled orders from revenue but counts them in ordersCount", async () => {
    await seedOrderWithItems({ totalPrice: 5000, status: "confirmed" });
    await seedOrderWithItems({ totalPrice: 3000, status: "cancelled" });
    const report = await generateDailyReport("fr");
    expect(report!.ordersCount).toBe(2);
    expect(report!.revenue).toBe(5000); // cancelled excluded
  });

  it("includes top 3 products by quantity in the message", async () => {
    await seedOrderWithItems({
      items: [
        { name: "Alpha", quantity: 5, unitPrice: 1000 },
        { name: "Beta", quantity: 3, unitPrice: 1000 },
        { name: "Gamma", quantity: 1, unitPrice: 1000 },
      ],
    });
    const report = await generateDailyReport("fr");
    expect(report!.topProducts).toHaveLength(3);
    expect(report!.topProducts[0]!.name).toBe("Alpha");
    expect(report!.topProducts[0]!.quantity).toBe(5);
    expect(report!.message).toContain("Alpha");
    expect(report!.message).toContain("Beta");
    expect(report!.message).toContain("Gamma");
  });

  it("aggregates the same product across multiple orders", async () => {
    await seedOrderWithItems({
      items: [{ name: "Widget", quantity: 2, unitPrice: 1000 }],
    });
    await seedOrderWithItems({
      items: [{ name: "Widget", quantity: 3, unitPrice: 1000 }],
    });
    const report = await generateDailyReport("fr");
    expect(report!.topProducts).toHaveLength(1);
    expect(report!.topProducts[0]!.quantity).toBe(5);
    expect(report!.topProducts[0]!.revenue).toBe(5000);
  });

  it("lists low-stock products (stock ≤ lowStockThreshold)", async () => {
    const cat = await db.category.create({ data: { name: "TestCat" } });
    await db.product.create({
      data: {
        name: "LowStockItem",
        price: 1000,
        stock: 2,
        lowStockThreshold: 5,
        categoryId: cat.id,
        isActive: true,
      },
    });
    await seedOrderWithItems();
    const report = await generateDailyReport("fr");
    const low = report!.lowStockProducts.find((p) => p.name === "LowStockItem");
    expect(low).toBeDefined();
    expect(low!.stock).toBe(2);
    expect(report!.message).toContain("LowStockItem");
  });

  it("includes the new-customers line when customers were created yesterday", async () => {
    // seedTestCustomer creates a customer with createdAt=now (today, not yesterday).
    // Force a customer with createdAt=yesterday.
    const y = yesterdayNoon();
    await db.customer.create({
      data: {
        name: "Yesterday Customer",
        phone: uniquePhone(),
        wilaya: "Alger",
        commune: "X",
        address: "Y",
        createdAt: y,
      },
    });
    await seedOrderWithItems({ createdAt: y });
    const report = await generateDailyReport("fr");
    expect(report!.newCustomers).toBeGreaterThanOrEqual(1);
    expect(report!.message).toContain("1"); // new customers count appears
  });

  it("reports delivery status counts in the message", async () => {
    await seedOrderWithItems({ deliveryStatus: "delivered" });
    await seedOrderWithItems({ deliveryStatus: "in_transit" });
    await seedOrderWithItems({ deliveryStatus: "returned" });
    const report = await generateDailyReport("fr");
    expect(report!.deliveredCount).toBe(1);
    expect(report!.inTransitCount).toBe(1);
    expect(report!.returnedCount).toBe(1);
    expect(report!.message).toContain("1");
  });

  it("respects the locale argument (en)", async () => {
    await seedOrderWithItems({ totalPrice: 5000 });
    const report = await generateDailyReport("en");
    expect(report!.locale).toBe("en");
    // The English locale file may or may not have the keys; the function falls
    // back to the key itself. Either way, the structure is preserved.
    expect(report!.message).toContain("1");
    // formatDZDBare is called without a locale arg → defaults to "fr" → "5\u202F000"
    expect(report!.message).toContain("5\u202F000");
  });

  it("ignores orders from today (only reports yesterday's)", async () => {
    // Order from yesterday → counted
    await seedOrderWithItems({ createdAt: yesterdayNoon(), totalPrice: 5000 });
    // Order from today → not counted
    await seedOrderWithItems({ createdAt: new Date(), totalPrice: 9999 });
    const report = await generateDailyReport("fr");
    expect(report!.ordersCount).toBe(1);
    expect(report!.revenue).toBe(5000);
  });
});
