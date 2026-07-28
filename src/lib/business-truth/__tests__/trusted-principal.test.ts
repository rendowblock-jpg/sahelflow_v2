process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { executeBusinessCommand } from "../command-kernel";
import { BUSINESS_ENVELOPE_SECRET_KEY } from "../envelope-key";
import { systemBusinessPrincipal } from "../principal";

const db = new PrismaClient();
const context = {
  prisma: db as never,
  businessPrincipal: systemBusinessPrincipal("migration"),
};

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

describe("trusted business principals", () => {
  it("persists trusted execution authorship and records the caller claim only as metadata", async () => {
    await executeBusinessCommand(
      context,
      {
        idempotencyKey: "trusted-principal-1",
        commandType: "principal.probe",
        aggregate: { type: "principal-probe", id: "principal-1", expectedVersion: 0 },
        actor: "forged-system-actor",
        correlationId: "principal-correlation-1",
        payload: { probe: true },
      },
      async ({ principal }) => ({
        result: { ok: true },
        audit: {
          action: "principal.probed",
          entity: "principal-probe",
          entityId: "principal-1",
          metadata: { handlerPrincipal: principal.auditActor },
        },
        events: [
          {
            key: "trusted-principal-event-1",
            type: "principal.probed",
            payload: { ok: true },
          },
        ],
      }),
    );

    const [command, audit] = await Promise.all([
      db.businessCommand.findUniqueOrThrow({ where: { idempotencyKey: "trusted-principal-1" } }),
      db.auditLog.findFirstOrThrow({ where: { action: "principal.probed" } }),
    ]);
    const metadata = JSON.parse(audit.metadata ?? "{}") as Record<string, unknown>;

    expect(command.actor).toBe("system:migration");
    expect(audit.actor).toBe("system:migration");
    expect(command.actor).not.toBe("forged-system-actor");
    expect(metadata).toMatchObject({
      trustedPrincipalKind: "system",
      trustedPrincipalSubject: "migration",
      claimedActor: "forged-system-actor",
      handlerPrincipal: "system:migration",
    });
  });
});
