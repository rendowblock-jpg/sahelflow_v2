import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanDb,
  createTestPrisma,
  seedCustomer,
  seedOrder,
  seedProduct,
  teardownTestPrisma,
} from "@/lib/data/__tests__/helpers";
import { isHeldOutboxIntent } from "@/lib/whatsapp/held-send";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";
import {
  HELD_SEND_EFFECT_TYPES,
  readPhoneTodayCounts,
} from "./phone-today-counts";

let prisma: PrismaClient;
let seq = 0;
let customerId = "";
let productId = "";

beforeAll(async () => {
  prisma = await createTestPrisma();
});
afterAll(async () => {
  await teardownTestPrisma(prisma);
});
beforeEach(async () => {
  await cleanDb(prisma);
  customerId = (await seedCustomer(prisma)).id;
  productId = (await seedProduct(prisma)).id;
});

async function order(
  status: string,
  totalPrice: number,
  extra: Record<string, unknown> = {},
) {
  const row = await seedOrder(prisma, { status, totalPrice, customerId, productId });
  if (Object.keys(extra).length > 0) {
    await prisma.order.update({ where: { id: row.id }, data: extra });
  }
  return row;
}

async function intent(
  effectType: string,
  status: string,
  outcomeState: string,
  lastErrorCode: string | null,
) {
  seq += 1;
  const command = await prisma.businessCommand.create({
    data: {
      id: `cmd-today-${seq}`,
      idempotencyKey: `key-today-${seq}`,
      commandType: "whatsapp_message.queue.v1",
      aggregateType: "whatsapp-message",
      aggregateId: `msg-${seq}`,
      requestHash: "0".repeat(64),
      actor: "test",
      correlationId: `msg-${seq}`,
      expectedVersion: 0,
      committedVersion: 1,
    },
  });
  await prisma.outboxIntent.create({
    data: {
      id: `intent-today-${seq}`,
      effectKey: `effect-today-${seq}`,
      commandId: command.id,
      effectType,
      payloadJson: "{}",
      status,
      outcomeState,
      lastErrorCode,
    },
  });
}

const TEXT = "whatsapp.text.send.v1";

describe("readPhoneTodayCounts: real database", () => {
  it("an empty shop is three zeros, not nulls", async () => {
    expect(await readPhoneTodayCounts({ prisma })).toEqual({
      ordersWaiting: 0,
      whatsappHeld: 0,
      codToCollectDzd: 0,
    });
  });

  it("ordersWaiting counts every pending order, not only the latest few, and nothing else", async () => {
    for (let i = 0; i < 11; i += 1) await order("pending", 1000);
    for (const s of ["draft", "confirmed", "shipped", "delivered", "returned", "refused", "cancelled"]) {
      await order(s, 1000);
    }
    const deleted = await order("pending", 1000);
    await prisma.order.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    const out = await readPhoneTodayCounts({ prisma });
    expect(out.ordersWaiting).toBe(11);
  });

  it("codToCollectDzd sums only shipped, uncollected, not-returning cash (NULL canonical states count)", async () => {
    await order("shipped", 1000); // codCollected null
    await order("shipped", 2000, { codCollected: false });
    await order("shipped", 300, { deliveryState: "out_for_delivery" });
    await order("shipped", 70, { codState: "receivable" });
    // none of the next ones may count
    await order("shipped", 4000, { codCollected: true });
    await order("shipped", 8000, { deliveryState: "returned" });
    await order("shipped", 16000, { deliveryState: "refused" });
    await order("shipped", 32000, { deliveryState: "return_in_transit" });
    await order("shipped", 64000, { codState: "collected" });
    await order("shipped", 128000, { codState: "remitted" });
    await order("shipped", 256000, { codState: "partially_remitted" });
    const gone = await order("shipped", 512000);
    await prisma.order.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    for (const s of ["draft", "pending", "confirmed", "delivered", "returned", "refused", "cancelled"]) {
      await order(s, 1024000);
    }
    const out = await readPhoneTodayCounts({ prisma });
    expect(out.codToCollectDzd).toBe(1000 + 2000 + 300 + 70);
  });

  it("whatsappHeld equals isHeldOutboxIntent over a full status/outcome/error matrix and the five send types only", async () => {
    const expected: boolean[] = [];
    for (const status of ["failed", "queued", "retrying", "dead_letter", "succeeded"]) {
      for (const outcomeState of ["none", "ambiguous", "receipt"]) {
        for (const code of [SEND_GUARD_HOLD_ERROR_CODE, "OTHER", null]) {
          await intent(TEXT, status, outcomeState, code);
          expected.push(isHeldOutboxIntent({ status, outcomeState, lastErrorCode: code }));
        }
      }
    }
    // a held-looking row of another effect type (media fetch) is not a message to approve
    await intent("whatsapp.media.fetch.v1", "failed", "none", SEND_GUARD_HOLD_ERROR_CODE);
    await intent("whatsapp.image.send.v1", "failed", "none", SEND_GUARD_HOLD_ERROR_CODE);
    const out = await readPhoneTodayCounts({ prisma });
    expect(expected.filter(Boolean).length).toBe(1);
    expect(out.whatsappHeld).toBe(expected.filter(Boolean).length + 1);
  });
});

describe("readPhoneTodayCounts: definitions stay tied to the code they mirror", () => {
  const root = join(__dirname, "..", "..", "..");
  it("the held-send effect types are exactly the five WhatsApp send types of durable-send", () => {
    const src = readFileSync(join(root, "src/lib/whatsapp/durable-send.ts"), "utf8");
    const found = [...src.matchAll(/export const WHATSAPP_(?:TEXT|IMAGE|VIDEO|DOCUMENT|VOICE)_EFFECT_TYPE = "([^"]+)"/g)].map((m) => m[1]);
    expect(found).toHaveLength(5);
    expect([...HELD_SEND_EFFECT_TYPES].sort()).toEqual([...found].sort());
  });
  it("the confirmation queue still counts status pending, not soft-deleted", () => {
    const src = readFileSync(join(root, "src/lib/orders/confirmation-workbench.ts"), "utf8");
    expect(src).toContain('const where = { status: "pending", deletedAt: null } as const;');
  });
});

describe("readPhoneTodayCounts: seam behaviour", () => {
  function stub(over: { orderCount?: () => Promise<number>; held?: () => Promise<number>; sum?: () => Promise<number | null> } = {}) {
    return {
      order: {
        count: vi.fn(over.orderCount ?? (async () => 4)),
        aggregate: vi.fn(async () => ({ _sum: { totalPrice: over.sum ? await over.sum() : 9500 } })),
      },
      outboxIntent: { count: vi.fn(over.held ?? (async () => 2)) },
    };
  }

  it("runs at most three queries", async () => {
    const p = stub();
    const out = await readPhoneTodayCounts({ prisma: p });
    expect(out).toEqual({ ordersWaiting: 4, whatsappHeld: 2, codToCollectDzd: 9500 });
    expect(p.order.count.mock.calls.length + p.order.aggregate.mock.calls.length + p.outboxIntent.count.mock.calls.length).toBe(3);
  });

  it("a failing query nulls only its own number and never throws", async () => {
    const p = stub({ held: async () => { throw new Error("boom"); } });
    const out = await readPhoneTodayCounts({ prisma: p });
    expect(out).toEqual({ ordersWaiting: 4, whatsappHeld: null, codToCollectDzd: 9500 });
  });

  it("a number the actor does not want is never queried", async () => {
    const p = stub();
    const out = await readPhoneTodayCounts({
      prisma: p,
      want: { ordersWaiting: false, whatsappHeld: true, codToCollectDzd: false },
    });
    expect(out).toEqual({ ordersWaiting: null, whatsappHeld: 2, codToCollectDzd: null });
    expect(p.order.count).not.toHaveBeenCalled();
    expect(p.order.aggregate).not.toHaveBeenCalled();
  });

  it("an empty sum is zero, a fractional or negative result is refused as null", async () => {
    expect((await readPhoneTodayCounts({ prisma: stub({ sum: async () => null }) })).codToCollectDzd).toBe(0);
    expect((await readPhoneTodayCounts({ prisma: stub({ sum: async () => 12.5 }) })).codToCollectDzd).toBeNull();
    expect((await readPhoneTodayCounts({ prisma: stub({ orderCount: async () => -1 }) })).ordersWaiting).toBeNull();
  });
});
