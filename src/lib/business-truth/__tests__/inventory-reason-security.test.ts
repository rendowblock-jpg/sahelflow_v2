process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import type { ServiceContext } from "@/lib/data/service-base";
import { executeBusinessCommand } from "../command-kernel";
import {
  BUSINESS_ENVELOPE_SECRET_KEY,
  getBusinessEnvelopeKey,
} from "../envelope-key";
import {
  inventoryMovementReasonBinding,
  openBusinessPayloadWithKey,
} from "../payload-codec";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;

async function clean(): Promise<void> {
  await db.$transaction([
    db.compensationFact.deleteMany(),
    db.projectionInvalidation.deleteMany(),
    db.financialMovement.deleteMany(),
    db.inventoryMovement.deleteMany(),
    db.inventoryReservation.deleteMany(),
    db.outboxIntent.deleteMany(),
    db.domainEvent.deleteMany(),
    db.businessCommand.deleteMany(),
    db.businessAggregateVersion.deleteMany(),
    db.auditLog.deleteMany(),
    db.secret.deleteMany({ where: { key: BUSINESS_ENVELOPE_SECRET_KEY } }),
  ]);
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("inventory movement reason security", () => {
  it("stores a customer-facing inventory explanation as record-bound ciphertext", async () => {
    const reason = "Return from Fatima Benali, phone 0555000111, 12 Rue Ciphertext";

    const execution = await executeBusinessCommand(
      context,
      {
        idempotencyKey: "inventory-reason-security-command",
        commandType: "inventory.reason-security-probe",
        aggregate: {
          type: "inventory-security-probe",
          id: "inventory-security-aggregate",
          expectedVersion: 0,
        },
        actor: "inventory-security-test",
        correlationId: "inventory-security-correlation",
        payload: { probe: true },
      },
      async ({ commandId }) => ({
        result: { ok: true },
        audit: {
          action: "inventory.reason-security-probed",
          entity: "inventory-security-probe",
          entityId: "inventory-security-aggregate",
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "inventory.reason-security-probed",
            payload: { ok: true },
          },
        ],
        inventoryMovements: [
          {
            movementKey: `${commandId}:movement`,
            movementType: "return_received",
            productId: "inventory-security-product",
            quantity: 1,
            fromPosition: "customer",
            toPosition: "available",
            reason,
          },
        ],
      }),
    );

    const movement = await db.inventoryMovement.findFirstOrThrow({
      where: { commandId: execution.commandId },
    });

    expect(movement.reason).not.toContain(reason);
    expect(movement.reason).not.toContain("Fatima");
    expect(movement.reason).not.toContain("0555000111");
    expect(JSON.parse(movement.reason)).toMatchObject({
      format: "sahelflow-business-command-result",
      version: 1,
      algorithm: "aes-256-gcm",
    });

    const envelopeKey = await getBusinessEnvelopeKey(context);
    expect(
      openBusinessPayloadWithKey(
        movement.reason,
        inventoryMovementReasonBinding(
          movement.commandId,
          movement.movementKey,
          movement.movementType,
        ),
        envelopeKey,
      ),
    ).toBe(reason);
  });
});
