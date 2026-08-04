process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  resolveShopProtectedKey,
  rewrapShopProtectedKeys,
} from "@/lib/crypto/protected-key-authority";
import { isProtectedValueEnvelope } from "@/lib/crypto/protected-value";
import { getMasterKey } from "@/lib/crypto/master-key";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import type { ServiceContext } from "@/lib/data/service-base";
import { getSecret } from "@/lib/secrets";
import { executeBusinessCommand } from "../command-kernel";
import {
  BUSINESS_ENVELOPE_SECRET_KEY,
  getBusinessEnvelopeKey,
} from "../envelope-key";
import { openBusinessPayloadWithKey } from "../payload-codec";
import { openBusinessCommandResultWithKey } from "../result-codec";

const db = new PrismaClient();
const context = {
  prisma: db as never,
  shop: TEST_SHOP_CONTEXT,
} satisfies ServiceContext;

const sensitive = {
  phone: "0555000111",
  address: "12 Rue Ciphertext",
  notes: "private business payload",
};

async function cleanBusinessTruth(): Promise<void> {
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

beforeEach(cleanBusinessTruth);

afterAll(async () => {
  await cleanBusinessTruth();
  await db.$disconnect();
});

describe("business envelope security", () => {
  it("stores replay, event, outbox and compensation payloads as authenticated ciphertext", async () => {
    const execution = await executeBusinessCommand(
      context,
      {
        idempotencyKey: "security-command-1",
        commandType: "security.probe",
        aggregate: {
          type: "security-probe",
          id: "security-aggregate-1",
          expectedVersion: 0,
        },
        actor: "security-test",
        correlationId: "security-correlation-1",
        payload: { probe: true },
      },
      async ({ commandId }) => ({
        result: {
          createdAt: new Date("2026-07-28T02:00:00.000Z"),
          customer: sensitive,
        },
        audit: {
          action: "security.probed",
          entity: "security-probe",
          entityId: "security-aggregate-1",
          after: { completed: true },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "security.event",
            payload: sensitive,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:effect`,
            effectType: "security.effect",
            payload: sensitive,
          },
        ],
        compensationFacts: [
          {
            key: `${commandId}:compensation`,
            type: "security.compensation",
            payload: sensitive,
          },
        ],
      }),
    );

    const [command, event, intent, fact, secret] = await Promise.all([
      db.businessCommand.findUniqueOrThrow({
        where: { idempotencyKey: "security-command-1" },
      }),
      db.domainEvent.findFirstOrThrow({ where: { commandId: execution.commandId } }),
      db.outboxIntent.findFirstOrThrow({ where: { commandId: execution.commandId } }),
      db.compensationFact.findFirstOrThrow({ where: { commandId: execution.commandId } }),
      db.secret.findUniqueOrThrow({ where: { key: BUSINESS_ENVELOPE_SECRET_KEY } }),
    ]);

    for (const encrypted of [
      command.resultJson,
      event.payloadJson,
      intent.payloadJson,
      fact.payloadJson,
    ]) {
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toContain(sensitive.phone);
      expect(encrypted).not.toContain(sensitive.address);
      expect(encrypted).not.toContain(sensitive.notes);
      expect(JSON.parse(encrypted ?? "{}")).toMatchObject({
        format: "sahelflow-business-command-result",
        version: 1,
        algorithm: "aes-256-gcm",
      });
    }

    const envelopeKey = await getBusinessEnvelopeKey(context);
    expect(
      openBusinessPayloadWithKey(
        event.payloadJson,
        {
          kind: "domain-event",
          recordKey: event.eventKey,
          recordType: event.eventType,
          commandId: event.commandId,
        },
        envelopeKey,
      ),
    ).toEqual(sensitive);
    expect(
      openBusinessPayloadWithKey(
        intent.payloadJson,
        {
          kind: "outbox-intent",
          recordKey: intent.effectKey,
          recordType: intent.effectType,
          commandId: intent.commandId,
        },
        envelopeKey,
      ),
    ).toEqual(sensitive);
    expect(
      openBusinessPayloadWithKey(
        fact.payloadJson,
        {
          kind: "compensation-fact",
          recordKey: fact.factKey,
          recordType: fact.factType,
          commandId: fact.commandId,
        },
        envelopeKey,
      ),
    ).toEqual(sensitive);

    expect(isProtectedValueEnvelope(secret.ciphertext)).toBe(true);
    const storedHex = await getSecret(context, BUSINESS_ENVELOPE_SECRET_KEY);
    expect(storedHex).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(storedHex ?? "", "hex").equals(envelopeKey)).toBe(true);
    expect(secret.ciphertext).not.toContain(storedHex ?? "");
    envelopeKey.fill(0);
  });

  it("keeps historical envelopes readable when the shop-secret key is re-wrapped", async () => {
    const result = await executeBusinessCommand(
      context,
      {
        idempotencyKey: "rotation-command-1",
        commandType: "rotation.probe",
        aggregate: {
          type: "rotation-probe",
          id: "rotation-aggregate-1",
          expectedVersion: 0,
        },
        actor: "rotation-test",
        correlationId: "rotation-correlation-1",
        payload: { probe: true },
      },
      async () => ({
        result: {
          createdAt: new Date("2026-07-28T02:10:00.000Z"),
          customer: sensitive,
        },
        audit: {
          action: "rotation.probed",
          entity: "rotation-probe",
          entityId: "rotation-aggregate-1",
        },
        events: [
          {
            key: "rotation-event-1",
            type: "rotation.event",
            payload: sensitive,
          },
        ],
      }),
    );

    const [command, event] = await Promise.all([
      db.businessCommand.findUniqueOrThrow({
        where: { idempotencyKey: "rotation-command-1" },
      }),
      db.domainEvent.findUniqueOrThrow({ where: { eventKey: "rotation-event-1" } }),
    ]);

    const stableKey = await getBusinessEnvelopeKey(context);
    const oldInstallationRoot = Buffer.from(getMasterKey());
    const replacementInstallationRoot = randomBytes(32);
    try {
      const rewrapped = await rewrapShopProtectedKeys(
        db,
        TEST_SHOP_CONTEXT,
        oldInstallationRoot,
        replacementInstallationRoot,
      );
      expect(rewrapped.rewrapped).toBeGreaterThanOrEqual(1);

      const reopenedAuthority = await resolveShopProtectedKey(
        db,
        "shop-secret",
        {
          shopContext: TEST_SHOP_CONTEXT,
          installationRoot: replacementInstallationRoot,
          createIfMissing: false,
        },
      );
      expect(reopenedAuthority.key.equals(stableKey)).toBe(false);
      reopenedAuthority.key.fill(0);

      const reopenedResult = openBusinessCommandResultWithKey<{
        createdAt: Date;
        customer: typeof sensitive;
      }>(
        command.resultJson ?? "",
        {
          commandId: command.id,
          idempotencyKey: command.idempotencyKey,
          requestHash: command.requestHash,
        },
        stableKey,
      );
      const reopenedEvent = openBusinessPayloadWithKey<typeof sensitive>(
        event.payloadJson,
        {
          kind: "domain-event",
          recordKey: event.eventKey,
          recordType: event.eventType,
          commandId: event.commandId,
        },
        stableKey,
      );

      expect(reopenedResult.createdAt).toBeInstanceOf(Date);
      expect(reopenedResult.customer).toEqual(sensitive);
      expect(reopenedEvent).toEqual(sensitive);
      expect(result.result.customer).toEqual(sensitive);
    } finally {
      await rewrapShopProtectedKeys(
        db,
        TEST_SHOP_CONTEXT,
        replacementInstallationRoot,
        oldInstallationRoot,
      );
      stableKey.fill(0);
      oldInstallationRoot.fill(0);
      replacementInstallationRoot.fill(0);
    }
  });
});
