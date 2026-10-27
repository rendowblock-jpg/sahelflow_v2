import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { createRefund, reverseRefund } from "@/lib/data/refund-service";
import { createTestPrisma, disconnectTestPrisma, seedCustomer, seedProduct } from "@/lib/data/__tests__/helpers";

import { forAllAsync, type SeededRandom } from "../../__tests__/helpers/seeded-random";

/**
 * Property tests for refunds on a delivered cash-on-delivery order (area 10).
 * Database-backed, so 60 cases instead of 300 (the rule needs real transactions).
 * Rules pinned: refunds in force never add up to more than the order total; a
 * refused refund changes nothing; the customer's lifetime spend is the order
 * total minus the refunds in force; stock goes back on the shelf exactly once,
 * and only while the order is in the returned state.
 */

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

// "edge" asks for what is still refundable plus delta (-1, 0 or +1), worked out when the step runs:
// random amounts almost never land on the exact boundary, where an off-by-one in the cap would hide.
type Step = { kind: "refund"; amount: number } | { kind: "edge"; delta: -1 | 0 | 1 } | { kind: "reverse"; pick: number };

function generateOrder(rng: SeededRandom) {
  const quantity = rng.int(1, 5);
  const unitPrice = rng.int(1, 200_000);
  const total = quantity * unitPrice;
  const steps: Step[] = Array.from({ length: rng.int(1, 7) }, (): Step => {
    if (rng.chance(0.25)) return { kind: "reverse", pick: rng.int(0, 1_000) };
    if (rng.chance(0.3)) return { kind: "edge", delta: rng.pick([-1, 0, 1] as const) };
    const roll = rng.int(0, 9);
    // Mostly sane amounts, sometimes the whole order, sometimes more than it is worth.
    const amount = roll < 5 ? rng.int(1, Math.max(1, Math.floor(total / 2))) : roll < 7 ? total : roll < 9 ? rng.int(1, total) : total + rng.int(1, 5_000);
    return { kind: "refund", amount };
  });
  return { quantity, unitPrice, total, stockBefore: rng.int(0, 500), steps };
}

async function refundsInForce(orderId: string): Promise<{ id: string; amount: number }[]> {
  return db.refund.findMany({ where: { orderId, reversed: false, status: { in: ["completed", "pending"] } }, select: { id: true, amount: true }, orderBy: { createdAt: "asc" } });
}

describe("refunds on a delivered order", () => {
  it("never exceed the order total, leave refused attempts without a trace, and keep spend and stock consistent (60 cases)", async () => {
    let counter = 0;
    // One product for all cases (the helper makes a category with a fixed name); each case resets its stock.
    const product = await seedProduct(db, { stock: 0 });
    let refused = 0;
    let settled = 0;
    const edgeSeen: Record<string, number> = {};
    const ran = await forAllAsync(
      "refund invariants",
      { seed: 0x2ef001, runs: 60, minRuns: 50 },
      generateOrder,
      async ({ quantity, unitPrice, total, stockBefore, steps }) => {
        counter += 1;
        const customer = await seedCustomer(db, { phone: `0550${String(counter).padStart(6, "0")}` });
        await db.customer.update({ where: { id: customer.id }, data: { orderCount: 1, totalSpent: total } });
        await db.product.update({ where: { id: product.id }, data: { stock: stockBefore } });
        const order = await db.order.create({
          data: {
            orderNumber: `ORD-PROP-${counter}`,
            status: "delivered",
            customerId: customer.id,
            totalPrice: total,
            wilaya: "Alger",
            commune: "Alger",
            address: "Test",
            phone: customer.phone,
            source: "manual",
            deliveredAt: new Date(),
            items: { create: [{ productId: product.id, productName: product.name, quantity, unitPrice, total }] },
          },
        });
        const context = { prisma: db as never };
        let attempt = 0;
        for (const step of steps) {
          attempt += 1;
          const before = await refundsInForce(order.id);
          const inForce = before.reduce((sum, refund) => sum + refund.amount, 0);
          if (step.kind === "refund" || step.kind === "edge") {
            const amount = step.kind === "refund" ? step.amount : total - inForce + step.delta;
            if (amount < 1) continue;
            const outcome = await createRefund(context, { orderId: order.id, amount, method: "cash", idempotencyKey: `prop-${counter}-${attempt}` }).then(
              () => "ok",
              () => "refused",
            );
            // Accepted exactly when it fits under what is still refundable.
            expect(outcome).toBe(inForce + amount <= total ? "ok" : "refused");
            if (outcome === "refused") refused += 1;
            if (step.kind === "edge") {
              edgeSeen[String(step.delta)] = (edgeSeen[String(step.delta)] ?? 0) + 1;
              if (step.delta === 1) expect(outcome).toBe("refused");
              if (step.delta === 0) expect(outcome).toBe("ok");
            }
          } else {
            const target = before[step.pick % Math.max(1, before.length)];
            if (target) await reverseRefund(context, target.id).catch(() => undefined);
          }
          const after = await refundsInForce(order.id);
          const afterSum = after.reduce((sum, refund) => sum + refund.amount, 0);
          expect(afterSum).toBeLessThanOrEqual(total);
          for (const refund of after) expect(Number.isSafeInteger(refund.amount) && refund.amount >= 1).toBe(true);
          const [row, owner, stock] = await Promise.all([
            db.order.findUnique({ where: { id: order.id } }),
            db.customer.findUnique({ where: { id: customer.id } }),
            db.product.findUnique({ where: { id: product.id } }),
          ]);
          // Lifetime spend is the order total minus the refunds still in force.
          expect(owner?.totalSpent).toBe(total - afterSum);
          // Stock is back on the shelf once, exactly while the order is returned.
          expect(stock?.stock).toBe(row?.status === "returned" ? stockBefore + quantity : stockBefore);
          if (row?.status === "returned") settled += 1;
          expect(["delivered", "returned"]).toContain(row?.status);
        }
      },
    );
    expect(ran).toBe(60);
    // The generator must reach both a refused refund and a fully settled order.
    expect(refused).toBeGreaterThan(5);
    expect(settled).toBeGreaterThan(5);
    // ...and the boundary itself: exactly the refundable amount (accepted) and one dinar more (refused).
    expect(edgeSeen["0"] ?? 0).toBeGreaterThan(3);
    expect(edgeSeen["1"] ?? 0).toBeGreaterThan(3);
  }, 120_000);
});
