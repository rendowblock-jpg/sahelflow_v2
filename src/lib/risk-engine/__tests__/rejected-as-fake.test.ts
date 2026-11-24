process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  cleanDb,
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
  seedCustomer,
} from "@/lib/data/__tests__/helpers";
import { assessRisk, assessOrderRisk, DEFAULT_RISK_CONFIG } from "@/lib/risk-engine";
import { batchAssessOrdersForWorkbench } from "@/lib/orders/order-risk-workbench";
import { buildConfirmationQueueRisk } from "@/lib/orders/confirmation-queue-risk";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { sealBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import type { PrismaClient } from "@prisma/client";
import type { ServiceContext } from "@/lib/data/service-base";

let db: PrismaClient;
let ctx: ServiceContext;

describe("fake-order gate M3: rejected_as_fake_before", () => {
  it("pure scoring flags a customer with a prior fake rejection without blacklisting or auto-rejecting", () => {
    const assessment = assessRisk(
      {
        order: {
          totalPrice: 3500,
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "Rue 1",
          phone: "0550112233",
          source: "storefront",
          createdAt: new Date("2026-11-22T12:00:00Z"),
        },
        customerHistory: {
          customerId: "c1",
          totalOrders: 1,
          deliveredCount: 0,
          returnedCount: 0,
          refusedCount: 0,
          cancelledCount: 1,
          rejectedAsFakeCount: 1,
          totalSpent: 0,
          firstOrderDate: new Date("2026-11-10T10:00:00Z"),
          lastOrderDate: new Date("2026-11-10T10:00:00Z"),
          isBlacklisted: false,
        },
      },
      DEFAULT_RISK_CONFIG,
    );

    const factor = assessment.factors.find((f) => f.id === "rejected_as_fake_before");
    expect(factor).toBeDefined();
    expect(factor?.points).toBe(25);
    expect(factor?.labelKey).toBe("risk.factors.rejectedAsFakeBefore");
    expect(assessment.action).not.toBe("blacklisted");

    const queueRisk = buildConfirmationQueueRisk(assessment, { contact: true });
    expect(queueRisk).toBeDefined();
    expect(queueRisk?.reasons.map((r) => r.code)).toContain("rejected_earlier");
  });

  it("pure scoring does not emit rejected_as_fake_before when rejectedAsFakeCount is 0", () => {
    const assessment = assessRisk(
      {
        order: {
          totalPrice: 3500,
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "Rue 1",
          phone: "0550112233",
          source: "storefront",
          createdAt: new Date("2026-11-22T12:00:00Z"),
        },
        customerHistory: {
          customerId: "c2",
          totalOrders: 1,
          deliveredCount: 0,
          returnedCount: 0,
          refusedCount: 0,
          cancelledCount: 1,
          rejectedAsFakeCount: 0,
          totalSpent: 0,
          firstOrderDate: new Date("2026-11-10T10:00:00Z"),
          lastOrderDate: new Date("2026-11-10T10:00:00Z"),
          isBlacklisted: false,
        },
      },
      DEFAULT_RISK_CONFIG,
    );

    expect(assessment.factors.find((f) => f.id === "rejected_as_fake_before")).toBeUndefined();
    expect(buildConfirmationQueueRisk(assessment, { contact: true })).toBeUndefined();
  });

  describe("real SQLite history integration", () => {
    beforeEach(async () => {
      db = await createTestPrisma();
      ctx = makeContext(db);
      await cleanDb(db);
    });

    afterAll(async () => {
      await disconnectTestPrisma(db);
    });

    it("flags the next pending order of a customer whose earlier order was sealed-rejected as fakeOrder, leaving other customers clean", async () => {
      const flaggedCustomer = await seedCustomer(db, { name: "Test One", phone: "0550998877" });
      const cleanCustomer = await seedCustomer(db, { name: "Test Two", phone: "0661223344" });
      const normalCancelCustomer = await seedCustomer(db, { name: "Test Three", phone: "0770334455" });

      const prevFake = await db.order.create({
        data: {
          orderNumber: "ORD-FAKE-1",
          status: "cancelled",
          customerId: flaggedCustomer.id,
          totalPrice: 4000,
          wilaya: "Alger",
          commune: "Hydra",
          address: "Rue A",
          phone: "0550998877",
          source: "storefront",
          createdAt: new Date("2026-11-01T10:00:00Z"),
        },
      });
      const key = await getBusinessEnvelopeKey(ctx);
      const commandId = "cmd-fake-reject-1";
      const envelope = sealBusinessPayloadWithKey(
        { rejectionReason: "fakeOrder" },
        {
          kind: "order-change-detail",
          recordKey: `${commandId}:rejection-reason`,
          recordType: "order.rejection-reason.v1",
          commandId,
        },
        key,
      );
      await db.orderChange.create({
        data: {
          orderId: prevFake.id,
          status: "cancelled",
          actionType: "status_change",
          actor: "owner",
          payload: JSON.stringify({
            from: "pending",
            to: "cancelled",
            decision: "reject",
            commandId,
            rejectionReasonEnvelope: envelope,
          }),
        },
      });

      const prevNormalCancel = await db.order.create({
        data: {
          orderNumber: "ORD-NORM-1",
          status: "cancelled",
          customerId: normalCancelCustomer.id,
          totalPrice: 4000,
          wilaya: "Alger",
          commune: "Hydra",
          address: "Rue B",
          phone: "0770334455",
          source: "storefront",
          createdAt: new Date("2026-11-01T10:00:00Z"),
        },
      });
      const cmdNorm = "cmd-norm-reject-1";
      const envNorm = sealBusinessPayloadWithKey(
        { rejectionReason: "customerCancelled" },
        {
          kind: "order-change-detail",
          recordKey: `${cmdNorm}:rejection-reason`,
          recordType: "order.rejection-reason.v1",
          commandId: cmdNorm,
        },
        key,
      );
      await db.orderChange.create({
        data: {
          orderId: prevNormalCancel.id,
          status: "cancelled",
          actionType: "status_change",
          actor: "owner",
          payload: JSON.stringify({
            from: "pending",
            to: "cancelled",
            decision: "reject",
            commandId: cmdNorm,
            rejectionReasonEnvelope: envNorm,
          }),
        },
      });

      const nextFlagged = await db.order.create({
        data: {
          orderNumber: "ORD-FAKE-2",
          status: "pending",
          customerId: flaggedCustomer.id,
          totalPrice: 3500,
          wilaya: "Alger",
          commune: "Hydra",
          address: "Rue A",
          phone: "0550998877",
          source: "storefront",
          createdAt: new Date("2026-11-20T10:00:00Z"),
        },
      });
      const nextClean = await db.order.create({
        data: {
          orderNumber: "ORD-CLEAN-1",
          status: "pending",
          customerId: cleanCustomer.id,
          totalPrice: 3500,
          wilaya: "Alger",
          commune: "Hydra",
          address: "Rue C",
          phone: "0661223344",
          source: "storefront",
          createdAt: new Date("2026-11-20T10:00:00Z"),
        },
      });
      const nextNormalCancel = await db.order.create({
        data: {
          orderNumber: "ORD-NORM-2",
          status: "pending",
          customerId: normalCancelCustomer.id,
          totalPrice: 3500,
          wilaya: "Alger",
          commune: "Hydra",
          address: "Rue B",
          phone: "0770334455",
          source: "storefront",
          createdAt: new Date("2026-11-20T10:00:00Z"),
        },
      });

      const batch = await batchAssessOrdersForWorkbench(
        ctx,
        [nextFlagged.id, nextClean.id, nextNormalCancel.id],
        { excludeSelfFromHistory: true },
      );

      const aFlagged = batch.get(nextFlagged.id)!;
      expect(aFlagged.factors.some((f) => f.id === "rejected_as_fake_before")).toBe(true);
      expect(buildConfirmationQueueRisk(aFlagged, { contact: true })?.reasons.map((r) => r.code)).toContain("rejected_earlier");

      const aClean = batch.get(nextClean.id)!;
      expect(aClean.factors.some((f) => f.id === "rejected_as_fake_before")).toBe(false);

      const aNorm = batch.get(nextNormalCancel.id)!;
      expect(aNorm.factors.some((f) => f.id === "rejected_as_fake_before")).toBe(false);

      const single = await assessOrderRisk(ctx, nextFlagged.id);
      expect(single?.factors.some((f) => f.id === "rejected_as_fake_before")).toBe(true);

      const reloaded = await db.order.findUnique({ where: { id: nextFlagged.id } });
      expect(reloaded?.status).toBe("pending");
    });
  });
});
