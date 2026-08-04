import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const harness = vi.hoisted(() => ({
  executeBusinessCommand: vi.fn(),
}));

vi.mock("@/lib/business-truth/command-kernel", () => ({
  executeBusinessCommand: harness.executeBusinessCommand,
}));

vi.mock("@/lib/business-truth/principal", () => ({
  businessPrincipalFromTrustedActor: vi.fn(() => ({
    auditActor: "person:test-owner",
    subject: "person:test-owner",
  })),
}));

import { aiActionHash, parseSensitiveAiToolArgs } from "../contracts";
import { mintAiActionExecutionAuthority } from "../execution-authority";
import { executeApprovedAiAction } from "../executor";
import { buildAiActionTargetSnapshot } from "../targets";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedProduct,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

let db: PrismaClient;

const approver = {
  version: 1,
  actor: {
    kind: "person",
    personId: "1".repeat(32),
    workspaceMemberId: "2".repeat(32),
    deviceId: "3".repeat(32),
    sessionId: "session-owner",
    role: "owner",
    policyVersion: 1,
    revocationEpoch: 0,
  },
  shop: TEST_SHOP_CONTEXT,
} as TrustedActorContext;

async function execute(
  toolName: string,
  rawArgs: Record<string, unknown>,
  proposalId: string,
) {
  const args = parseSensitiveAiToolArgs(toolName, rawArgs);
  const target = await buildAiActionTargetSnapshot(
    { prisma: db as never, shop: TEST_SHOP_CONTEXT },
    toolName,
    args,
  );
  const argsHash = aiActionHash(args);
  const proposalDigest = aiActionHash({ proposalId, argsHash });
  const executionKey = `execution:${proposalId}`;
  const authority = mintAiActionExecutionAuthority({
    proposalId,
    proposalDigest,
    toolName,
    argsHash,
    executionKey,
  });
  return executeApprovedAiAction({
    context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
    authority,
    proposalId,
    proposalDigest,
    executionKey,
    toolName,
    args,
    argsHash,
    targetBindingHash: aiActionHash(target.targetBinding),
    requesterActorId: approver.actor.kind === "person"
      ? approver.actor.personId
      : "system",
    requesterSessionId: "requester-session",
    approver,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  harness.executeBusinessCommand.mockImplementation(
    async (context, _command, work) => {
      const outcome = await work({ tx: context.prisma });
      return {
        commandId: "command-test",
        aggregateVersion: 1,
        replayed: false,
        result: outcome.result,
      };
    },
  );
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

describe("proposal-bound catalog invariants", () => {
  it("updates product and its sole variant stock atomically", async () => {
    const product = await seedProduct(db, { stock: 10 });
    const variant = await db.productVariant.create({
      data: {
        productId: product.id,
        name: "Default",
        price: product.price,
        stock: 10,
        isActive: true,
        sortOrder: 0,
      },
    });

    await execute(
      "update_product_stock",
      { productId: product.id, newStock: 25, reason: "Counted" },
      "proposal-stock",
    );

    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(25);
    expect((await db.productVariant.findUnique({ where: { id: variant.id } }))?.stock).toBe(25);
  });

  it("updates product and its sole variant price atomically", async () => {
    const product = await seedProduct(db, { price: 1000 });
    const variant = await db.productVariant.create({
      data: {
        productId: product.id,
        name: "Default",
        price: 1000,
        stock: product.stock,
        isActive: true,
        sortOrder: 0,
      },
    });

    await execute(
      "update_product_price",
      { productId: product.id, newPrice: 1500 },
      "proposal-price",
    );

    expect((await db.product.findUnique({ where: { id: product.id } }))?.price).toBe(1500);
    expect((await db.productVariant.findUnique({ where: { id: variant.id } }))?.price).toBe(1500);
  });

  it("refuses ambiguous product-level mutations for multi-variant products", async () => {
    const product = await seedProduct(db);
    await db.productVariant.createMany({
      data: [
        {
          productId: product.id,
          name: "Small",
          price: product.price,
          stock: 5,
          isActive: true,
          sortOrder: 0,
        },
        {
          productId: product.id,
          name: "Large",
          price: product.price,
          stock: 5,
          isActive: true,
          sortOrder: 1,
        },
      ],
    });

    await expect(
      buildAiActionTargetSnapshot(
        { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        "update_product_stock",
        { productId: product.id, newStock: 20 },
      ),
    ).rejects.toMatchObject({ code: "AI_ACTION_VARIANT_SCOPE_REQUIRED" });
  });

  it("requires the exact active variant before creating an order proposal", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db);
    await db.productVariant.create({
      data: {
        productId: product.id,
        name: "Default",
        price: product.price,
        stock: product.stock,
        isActive: true,
        sortOrder: 0,
      },
    });

    await expect(
      buildAiActionTargetSnapshot(
        { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        "create_order",
        {
          customerId: customer.id,
          items: [{ productId: product.id, quantity: 1 }],
          wilaya: "Alger",
          commune: "Alger Centre",
          address: "1 Rue Test",
          phone: "0555123456",
        },
      ),
    ).rejects.toMatchObject({ code: "AI_ACTION_VARIANT_REQUIRED" });
  });
});
