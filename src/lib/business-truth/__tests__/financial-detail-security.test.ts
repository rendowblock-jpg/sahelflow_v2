process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import type { ServiceContext } from "@/lib/data/service-base";
import { executeBusinessCommand } from "../command-kernel";
import {
  BUSINESS_ENVELOPE_SECRET_KEY,
  getBusinessEnvelopeKey,
} from "../envelope-key";
import {
  financialMovementDetailBinding,
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

describe("financial movement detail security", () => {
  it("stores counterparty, reference and reason as record-bound ciphertext", async () => {
    const details = {
      counterparty: "Customer Fatima Benali",
      reference: "0555000111 account reference",
      reason: "Refund to 12 Rue Ciphertext",
    };

    const execution = await executeBusinessCommand(
      context,
      {
        idempotencyKey: "financial-security-command",
        commandType: "financial.security-probe",
        aggregate: {
          type: "financial-security-probe",
          id: "financial-security-aggregate",
          expectedVersion: 0,
        },
        actor: "financial-security-test",
        correlationId: "financial-security-correlation",
        payload: { probe: true },
      },
      async ({ commandId }) => ({
        result: { ok: true },
        audit: {
          action: "financial.security-probed",
          entity: "financial-security-probe",
          entityId: "financial-security-aggregate",
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "financial.security-probed",
            payload: { ok: true },
          },
        ],
        financialMovements: [
          {
            movementKey: `${commandId}:movement`,
            movementType: "refund_issued",
            amount: 2500,
            currency: "DZD" as const,
            counterparty: details.counterparty,
            reference: details.reference,
            reason: details.reason,
          },
        ],
      }),
    );

    const movement = await db.financialMovement.findFirstOrThrow({
      where: { commandId: execution.commandId },
    });

    for (const stored of [
      movement.counterparty,
      movement.reference,
      movement.reason,
    ]) {
      expect(stored).toBeTruthy();
      expect(stored).not.toContain(details.counterparty);
      expect(stored).not.toContain(details.reference);
      expect(stored).not.toContain(details.reason);
      expect(JSON.parse(stored ?? "{}")).toMatchObject({
        format: "sahelflow-business-command-result",
        version: 1,
        algorithm: "aes-256-gcm",
      });
    }

    const envelopeKey = await getBusinessEnvelopeKey(context);
    expect(
      openBusinessPayloadWithKey(
        movement.counterparty ?? "",
        financialMovementDetailBinding(
          movement.commandId,
          movement.movementKey,
          movement.movementType,
          "counterparty",
        ),
        envelopeKey,
      ),
    ).toBe(details.counterparty);
    expect(
      openBusinessPayloadWithKey(
        movement.reference ?? "",
        financialMovementDetailBinding(
          movement.commandId,
          movement.movementKey,
          movement.movementType,
          "reference",
        ),
        envelopeKey,
      ),
    ).toBe(details.reference);
    expect(
      openBusinessPayloadWithKey(
        movement.reason,
        financialMovementDetailBinding(
          movement.commandId,
          movement.movementKey,
          movement.movementType,
          "reason",
        ),
        envelopeKey,
      ),
    ).toBe(details.reason);
  });
});
