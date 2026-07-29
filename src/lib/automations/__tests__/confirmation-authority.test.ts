process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { dispatchSelectedAutomations } from "../engine";

const context = { prisma: rawDb as never };

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("automation confirmation authority", () => {
  it("records a terminal skip and leaves the order pending", async () => {
    const customer = await rawDb.customer.create({
      data: {
        name: "Automation Customer",
        phone: "0555000801",
        nameBlindIndex: "automation-customer",
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Automation address",
      },
    });
    const order = await rawDb.order.create({
      data: {
        orderNumber: "AUTO-DENY-001",
        status: "pending",
        version: 1,
        customerId: customer.id,
        totalPrice: 1000,
        deliveryCost: 0,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Automation address",
        phone: customer.phone,
        source: "import",
        items: {
          create: [{
            productName: "Unmapped import",
            quantity: 1,
            unitPrice: 1000,
            total: 1000,
          }],
        },
      },
    });
    const automation = await rawDb.automation.create({
      data: {
        name: "Unsafe confirmation",
        trigger: "order.created",
        action: "update_status",
        config: JSON.stringify({ targetStatus: "confirmed" }),
        isActive: true,
      },
    });

    const receipts = await dispatchSelectedAutomations(
      context,
      "order.created",
      { orderId: order.id, orderNumber: order.orderNumber },
      { automationIds: [automation.id], durableReceipt: "automation-denied" },
    );

    expect(receipts).toEqual([{
      automationId: automation.id,
      status: "skipped",
      message: "Confirmation requires trusted manual approval",
    }]);
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await rawDb.automationLog.findFirst({ where: { automationId: automation.id } })).toMatchObject({
      status: "skipped",
    });
  });
});
