process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const requireRecentReauthenticationMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

vi.mock("@/lib/auth/server", () => ({
  requireRecentReauthentication: requireRecentReauthenticationMock,
}));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn().mockResolvedValue({
    actor: { kind: "person", personId: "reset-test" },
    shop: { shopId: "default" },
  }),
  assertTrustedAction: vi.fn(),
  trustedActorAuditIdentity: vi.fn(() => "person:reset-test"),
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { BUSINESS_ENVELOPE_SECRET_KEY } from "@/lib/business-truth/envelope-key";
import {
  getJson,
  mockPost,
  rawDb,
} from "@/app/api/__tests__/helpers";
import { POST } from "./route";

async function clearBusinessTruth(): Promise<void> {
  await rawDb.$transaction([
    rawDb.collaborationMention.deleteMany(),
    rawDb.collaborationComment.deleteMany(),
    rawDb.collaborationHandover.deleteMany(),
    rawDb.collaborationAssignment.deleteMany(),
    rawDb.collaborationWorkgroupMember.deleteMany(),
    rawDb.collaborationQueue.deleteMany(),
    rawDb.collaborationWorkgroup.deleteMany(),
    rawDb.compensationFact.deleteMany(),
    rawDb.projectionInvalidation.deleteMany(),
    rawDb.financialMovement.deleteMany(),
    rawDb.inventoryMovement.deleteMany(),
    rawDb.inventoryReservation.deleteMany(),
    rawDb.outboxIntent.deleteMany(),
    rawDb.domainEvent.deleteMany(),
    rawDb.businessCommand.deleteMany(),
    rawDb.businessAggregateVersion.deleteMany(),
    rawDb.secret.deleteMany({ where: { key: BUSINESS_ENVELOPE_SECRET_KEY } }),
  ]);
}

beforeEach(async () => {
  requireRecentReauthenticationMock.mockClear();
  await clearBusinessTruth();
});

afterAll(async () => {
  await clearBusinessTruth();
  await rawDb.$disconnect();
});

describe("POST /api/settings/reset business-truth authority", () => {
  it("purges canonical authority in foreign-key-safe order and preserves the wrapped key", async () => {
    const commandId = "reset-business-command";
    const reservationId = "reset-reservation";

    await rawDb.secret.create({
      data: {
        key: BUSINESS_ENVELOPE_SECRET_KEY,
        ciphertext: "wrapped-key-ciphertext",
        iv: "wrapped-key-iv",
        tag: "wrapped-key-tag",
      },
    });
    await rawDb.businessAggregateVersion.create({
      data: {
        aggregateType: "order",
        aggregateId: "reset-order",
        version: 1,
      },
    });
    await rawDb.businessCommand.create({
      data: {
        id: commandId,
        idempotencyKey: "reset-command-key",
        commandType: "order.reset-probe",
        aggregateType: "order",
        aggregateId: "reset-order",
        requestHash: "a".repeat(64),
        status: "committed",
        resultJson: "encrypted-result",
        actor: "reset-test",
        correlationId: "reset-correlation",
        expectedVersion: 0,
        committedVersion: 1,
        committedAt: new Date(),
      },
    });
    await rawDb.domainEvent.create({
      data: {
        id: "reset-event",
        eventKey: "reset-event-key",
        commandId,
        eventType: "order.reset-probe",
        aggregateType: "order",
        aggregateId: "reset-order",
        aggregateVersion: 1,
        payloadJson: "encrypted-event",
      },
    });
    await rawDb.outboxIntent.create({
      data: {
        id: "reset-outbox",
        effectKey: "reset-effect-key",
        commandId,
        effectType: "reset.effect",
        payloadJson: "encrypted-effect",
      },
    });
    await rawDb.inventoryReservation.create({
      data: {
        id: reservationId,
        reservationKey: "reset-reservation-key",
        orderId: "reset-order",
        productId: "reset-product",
        quantity: 1,
        createdByCommandId: commandId,
      },
    });
    await rawDb.inventoryMovement.create({
      data: {
        id: "reset-inventory-movement",
        movementKey: "reset-inventory-key",
        commandId,
        orderId: "reset-order",
        reservationId,
        productId: "reset-product",
        movementType: "reservation_created",
        quantity: 1,
        fromPosition: "available",
        toPosition: "reserved",
        reason: "reset-test",
      },
    });
    await rawDb.financialMovement.create({
      data: {
        id: "reset-financial-movement",
        movementKey: "reset-financial-key",
        commandId,
        orderId: "reset-order",
        movementType: "cod_receivable_created",
        amount: 1000,
        currency: "DZD",
        reason: "reset-test",
      },
    });
    await rawDb.projectionInvalidation.create({
      data: {
        id: "reset-projection",
        commandId,
        projectionKey: "order:reset-order",
      },
    });
    await rawDb.compensationFact.create({
      data: {
        id: "reset-compensation",
        factKey: "reset-compensation-key",
        commandId,
        factType: "reset.compensation",
        payloadJson: "encrypted-compensation",
      },
    });
    await rawDb.collaborationWorkgroup.create({
      data: {
        id: "reset-workgroup",
        name: "Reset workgroup",
        createdByMemberId: "reset-test",
      },
    });
    await rawDb.collaborationWorkgroupMember.create({
      data: {
        workgroupId: "reset-workgroup",
        memberId: "reset-member",
        addedByMemberId: "reset-test",
      },
    });
    await rawDb.collaborationQueue.create({
      data: {
        id: "reset-queue",
        key: "reset-queue",
        name: "Reset queue",
        entityType: "order",
        workgroupId: "reset-workgroup",
        createdByMemberId: "reset-test",
      },
    });
    await rawDb.collaborationAssignment.create({
      data: {
        entityType: "order",
        entityId: "reset-order",
        queueId: "reset-queue",
        workgroupId: "reset-workgroup",
        assigneeMemberId: "reset-member",
        updatedByMemberId: "reset-test",
        commandId: "reset-assignment-command",
      },
    });
    await rawDb.collaborationComment.create({
      data: {
        id: "reset-comment",
        entityType: "order",
        entityId: "reset-order",
        authorMemberId: "reset-test",
        bodyJson: JSON.stringify({ text: "must be deleted" }),
        commandId: "reset-comment-command",
      },
    });
    await rawDb.collaborationMention.create({
      data: {
        commentId: "reset-comment",
        memberId: "reset-member",
      },
    });
    await rawDb.collaborationHandover.create({
      data: {
        id: "reset-handover",
        entityType: "order",
        entityId: "reset-order",
        toMemberId: "reset-member",
        toQueueId: "reset-queue",
        toWorkgroupId: "reset-workgroup",
        fromState: "open",
        toState: "closed",
        commandId: "reset-handover-command",
      },
    });

    const response = await POST(
      mockPost("http://localhost/api/settings/reset", { confirm: "RESET" }),
    );
    expect(response.status).toBe(200);
    await expect(getJson(response)).resolves.toMatchObject({ ok: true });
    expect(requireRecentReauthenticationMock).toHaveBeenCalledOnce();

    await expect(
      Promise.all([
        rawDb.compensationFact.count(),
        rawDb.projectionInvalidation.count(),
        rawDb.financialMovement.count(),
        rawDb.inventoryMovement.count(),
        rawDb.inventoryReservation.count(),
        rawDb.outboxIntent.count(),
        rawDb.domainEvent.count(),
        rawDb.businessCommand.count(),
        rawDb.businessAggregateVersion.count(),
        rawDb.collaborationMention.count(),
        rawDb.collaborationComment.count(),
        rawDb.collaborationHandover.count(),
        rawDb.collaborationAssignment.count(),
        rawDb.collaborationWorkgroupMember.count(),
        rawDb.collaborationQueue.count(),
        rawDb.collaborationWorkgroup.count(),
      ]),
    ).resolves.toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(
      rawDb.secret.findUnique({ where: { key: BUSINESS_ENVELOPE_SECRET_KEY } }),
    ).resolves.toMatchObject({ key: BUSINESS_ENVELOPE_SECRET_KEY });
  });
});
