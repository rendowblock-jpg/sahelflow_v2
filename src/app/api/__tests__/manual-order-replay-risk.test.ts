process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
} from "@/app/api/__tests__/helpers";

const { assessOrderRiskMock, scheduleAutomationOutboxMock } = vi.hoisted(() => ({
  assessOrderRiskMock: vi.fn(async () => ({
    score: 25,
    level: "low",
    factors: [],
    triggeredRules: ["new_customer"],
  })),
  scheduleAutomationOutboxMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

vi.mock("@/lib/risk-engine", () => ({
  assessOrderRisk: assessOrderRiskMock,
}));

vi.mock("@/lib/business-truth/outbox-worker", () => ({
  scheduleAutomationOutbox: scheduleAutomationOutboxMock,
}));

import { POST as POSTOrder } from "@/app/api/orders/route";

async function seedCustomer() {
  return rawDb.customer.create({
    data: {
      name: "Replay Risk Customer",
      phone: "0555000222",
      nameBlindIndex: "replay-risk-customer",
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "2 Replay Street",
    },
  });
}

beforeEach(async () => {
  await cleanDb();
  assessOrderRiskMock.mockClear();
  scheduleAutomationOutboxMock.mockClear();
});
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("manual create replay risk behavior", () => {
  it("evaluates advisory risk once and skips trigger analytics on exact replay", async () => {
    const product = await seedProduct({ price: 2500, stock: 10 });
    const customer = await seedCustomer();
    const body = {
      idempotencyKey: "manual-create-risk-replay-0001",
      correlationId: "manual-create-risk-replay-correlation",
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "2 Replay Street",
      phone: "0555000222",
      deliveryCost: 600,
      source: "manual",
    };

    const first = await POSTOrder(
      mockPost("http://localhost/api/orders", body),
    );
    const replay = await POSTOrder(
      mockPost("http://localhost/api/orders", body),
    );

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    const firstBody = await getJson(first);
    const replayBody = await getJson(replay);
    const firstOrder = firstBody.order as { id: string };
    const replayOrder = replayBody.order as { id: string };
    expect(firstBody.risk).toMatchObject({ score: 25, level: "low" });
    expect(firstBody.command).toMatchObject({ replayed: false });
    expect(replayBody.risk).toBeNull();
    expect(replayBody.command).toMatchObject({ replayed: true });
    expect(replayOrder.id).toBe(firstOrder.id);
    expect(assessOrderRiskMock).toHaveBeenCalledTimes(1);
    expect(await rawDb.order.count()).toBe(1);
  });
});
