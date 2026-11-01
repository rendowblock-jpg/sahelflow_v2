/**
 * The approved AI create_order path adds up unitPrice x quantity itself. It must
 * refuse a total above MAX_MONEY_DZD (999,999,999 DZD) like every other path
 * that creates an order, and write nothing.
 *
 * The real executor runs against a real in-memory database. Only the command
 * ledger wrapper and the audit principal are replaced: the wrapper runs the
 * mutation in a real transaction, which is the part under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/business-truth/command-kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/business-truth/command-kernel")>();
  return {
    ...actual,
    executeBusinessCommand: async (
      context: { prisma: PrismaClient },
      _command: unknown,
      run: (input: { tx: unknown }) => Promise<unknown>,
    ) => context.prisma.$transaction(async (tx) => run({ tx })),
  };
});

vi.mock("@/lib/business-truth/principal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/business-truth/principal")>();
  return {
    ...actual,
    businessPrincipalFromTrustedActor: () => ({ auditActor: "person:test-approver" }),
  };
});

import { aiActionHash, parseSensitiveAiToolArgs } from "../contracts";
import { executeApprovedAiAction } from "../executor";
import { mintAiActionExecutionAuthority } from "../execution-authority";
import { buildAiActionTargetSnapshot } from "../targets";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedProduct,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";
import { MAX_MONEY_DZD } from "@/lib/orders/money-limits";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

let db: PrismaClient;
let counter = 0;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function approveCreateOrder(unitPrice: number, quantity: number) {
  const customer = await seedCustomer(db);
  const product = await seedProduct(db, { price: unitPrice, stock: 1000 });
  const args = parseSensitiveAiToolArgs("create_order", {
    customerId: customer.id,
    items: [{ productId: product.id, quantity }],
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "123 Rue Didouche",
    phone: "0555123456",
  });
  const context = { prisma: db as never, shop: TEST_SHOP_CONTEXT };
  const snapshot = await buildAiActionTargetSnapshot(context, "create_order", args);
  counter += 1;
  const proposalId = `proposal-ceiling-${counter}`;
  const proposalDigest = `digest-ceiling-${counter}`.padEnd(64, "0");
  const executionKey = `execution-ceiling-${counter}`;
  const argsHash = aiActionHash(args);
  return executeApprovedAiAction({
    context,
    authority: mintAiActionExecutionAuthority({
      proposalId,
      proposalDigest,
      toolName: "create_order",
      argsHash,
      executionKey,
    }),
    proposalId,
    proposalDigest,
    executionKey,
    toolName: "create_order",
    args,
    argsHash,
    targetBindingHash: aiActionHash(snapshot.targetBinding),
    requesterActorId: "person:test-requester",
    requesterSessionId: "session-ceiling",
    approver: { version: 1, actor: { kind: "person" }, shop: TEST_SHOP_CONTEXT } as unknown as TrustedActorContext,
  });
}

describe("AI create_order total ceiling", () => {
  it("refuses a total above the ceiling and writes no order", async () => {
    // 1,000,000 DZD x 999 = 999,000,000: fine. 2,000,000 x 999 = 1,998,000,000: over.
    await expect(approveCreateOrder(2_000_000, 999)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "The order total is too large",
    });
    expect(await db.order.count()).toBe(0);
  });

  it("accepts a total of exactly the ceiling", async () => {
    // 333,333,333 x 3 = 999,999,999 = MAX_MONEY_DZD.
    await approveCreateOrder(333_333_333, 3);
    const orders = await db.order.findMany();
    expect(orders).toHaveLength(1);
    expect(orders[0]?.totalPrice).toBe(MAX_MONEY_DZD);
  });

  it("refuses one dinar over the ceiling", async () => {
    // 500,000,000 x 2 = 1,000,000,000 = MAX_MONEY_DZD + 1.
    await expect(approveCreateOrder(500_000_000, 2)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(await db.order.count()).toBe(0);
  });
});
