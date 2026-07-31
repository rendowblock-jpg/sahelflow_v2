process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import {
  testAuthenticatedOwnerBusinessPrincipal,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import "@/lib/ai/chat/tools/core-tools";
import {
  runWithAiSourceProposal,
} from "@/lib/ai/chat/source-proposal";
import { getTool, type ToolContext } from "@/lib/ai/chat/tools/registry";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { resolveCanonicalNamedItems } from "@/lib/orders/canonical-named-items";
import { submitCanonicalSourceDraft } from "@/lib/orders/canonical-source-draft";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";

const ownerContext = {
  prisma: rawDb as never,
  shop: TEST_SHOP_CONTEXT,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal(
    "canonical-ai-intake-owner",
  ),
} satisfies BusinessPrincipalContext;

async function seedProduct(input: {
  name: string;
  sku?: string;
  price: number;
  stock?: number;
}) {
  const category = await rawDb.category.create({
    data: { name: `${input.name}-${crypto.randomUUID()}` },
  });
  return rawDb.product.create({
    data: {
      name: input.name,
      sku: input.sku ?? null,
      price: input.price,
      stock: input.stock ?? 20,
      categoryId: category.id,
      isActive: true,
    },
  });
}

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("canonical named source item authority", () => {
  it("requires an exact active variant and groups duplicate extracted lines", async () => {
    const product = await seedProduct({
      name: "T-Shirt",
      sku: "TSHIRT",
      price: 2000,
    });
    const large = await rawDb.productVariant.create({
      data: {
        productId: product.id,
        name: "Large",
        sku: "TS-L",
        price: 2600,
        stock: 8,
        isActive: true,
      },
    });

    await expect(
      resolveCanonicalNamedItems(
        { prisma: rawDb as never },
        [{ productName: "T-Shirt", quantity: 1 }],
      ),
    ).rejects.toThrow(/requires an exact active variant/i);

    const resolved = await resolveCanonicalNamedItems(
      { prisma: rawDb as never },
      [
        { productName: "T-Shirt Large", quantity: 1 },
        { productName: "TS-L", quantity: 2 },
      ],
    );
    expect(resolved).toEqual([
      {
        productId: product.id,
        productVariantId: large.id,
        quantity: 3,
      },
    ]);
  });
});

describe("canonical AI source draft", () => {
  it("binds create_order to the persisted proposal, uses server price and replays", async () => {
    const product = await seedProduct({
      name: "AI Product",
      price: 3100,
      stock: 10,
    });
    const customer = await rawDb.customer.create({
      data: {
        name: "AI Customer",
        phone: "0555123456",
        nameBlindIndex: "ai-customer",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "1 AI Street",
      },
    });
    const tool = getTool("create_order");
    if (!tool) throw new Error("create_order is not registered");
    const toolContext: ToolContext = {
      db: rawDb,
      shop: TEST_SHOP_CONTEXT,
    };
    const params = {
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2 }],
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "1 AI Street",
      phone: "0555123456",
      notes: "Persisted AI proposal",
    };
    const proposal = {
      sourceIdentity: "ai-session:session-1",
      sourceOrderId: "ai-proposal:assistant-message-1",
    };

    const first = await runWithAiSourceProposal(proposal, () =>
      tool.execute(params, toolContext),
    );
    const replay = await runWithAiSourceProposal(proposal, () =>
      tool.execute(params, toolContext),
    );

    expect(first.success).toBe(true);
    expect(replay.success).toBe(true);
    expect(replay.data).toMatchObject({ replayed: true });
    expect(await rawDb.order.count()).toBe(1);
    expect(await rawDb.businessCommand.count()).toBe(1);

    const order = await rawDb.order.findFirst({ include: { items: true } });
    expect(order).toMatchObject({
      source: "ai_chat",
      sourceOrderId: proposal.sourceOrderId,
      status: "draft",
      version: 1,
      totalPrice: 6200,
    });
    expect(order?.items[0]).toMatchObject({
      productId: product.id,
      quantity: 2,
      unitPrice: 3100,
    });
    expect(
      isCanonicalOrderAuthority(order?.source, order?.sourceMetadata),
    ).toBe(true);
  });

  it("submits the draft once, then enters normal confirmation and reservation authority", async () => {
    const product = await seedProduct({
      name: "Submission Product",
      price: 2500,
      stock: 7,
    });
    const customer = await rawDb.customer.create({
      data: {
        name: "Submission Customer",
        phone: "0555123456",
        nameBlindIndex: "submission-customer",
        wilaya: "Alger",
        commune: "Centre",
        address: "2 AI Street",
      },
    });
    const tool = getTool("create_order");
    if (!tool) throw new Error("create_order is not registered");
    const created = await runWithAiSourceProposal(
      {
        sourceIdentity: "ai-session:session-2",
        sourceOrderId: "ai-proposal:assistant-message-2",
      },
      () =>
        tool.execute(
          {
            customerId: customer.id,
            items: [{ productId: product.id, quantity: 2 }],
            wilaya: "Alger",
            commune: "Centre",
            address: "2 AI Street",
            phone: "0555123456",
          },
          { db: rawDb, shop: TEST_SHOP_CONTEXT },
        ),
    );
    expect(created.success).toBe(true);
    const orderId = (created.data as { id: string }).id;

    const submissionInput = {
      orderId,
      expectedVersion: 1,
      idempotencyKey: "ai-draft-submit-replay",
    };
    const first = await submitCanonicalSourceDraft(
      ownerContext,
      submissionInput,
    );
    const replay = await submitCanonicalSourceDraft(
      ownerContext,
      submissionInput,
    );
    expect(first.result).toMatchObject({ status: "pending", version: 2 });
    expect(replay).toEqual({ ...first, replayed: true });

    const confirmation = await executeManualOrderDecision(ownerContext, {
      orderId,
      decision: "confirm",
      expectedVersion: 2,
      idempotencyKey: "ai-draft-confirm-after-submit",
    });
    expect(confirmation.result).toMatchObject({
      status: "confirmed",
      version: 3,
    });
    expect(await rawDb.inventoryReservation.count()).toBe(1);
    expect(
      (await rawDb.product.findUnique({ where: { id: product.id } }))?.stock,
    ).toBe(5);
  });
});
