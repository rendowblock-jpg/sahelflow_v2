process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import type { ServiceContext } from "@/lib/data/service-base";
import { executeBusinessCommand } from "../command-kernel";
import { BUSINESS_ENVELOPE_SECRET_KEY } from "../envelope-key";

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

describe("simultaneous same-key command execution", () => {
  it("runs one handler and returns the committed result to the queued retry", async () => {
    let handlerRuns = 0;
    const command = {
      idempotencyKey: "simultaneous-same-key-command",
      commandType: "test.simultaneous-same-key",
      aggregate: {
        type: "same-key-probe",
        id: "same-key-aggregate",
        expectedVersion: 0,
      },
      actor: "same-key-test",
      correlationId: "same-key-correlation",
      payload: { value: 42 },
    } as const;

    const execute = () =>
      executeBusinessCommand(context, command, async ({ commandId }) => {
        handlerRuns += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          result: {
            value: 42,
            completedAt: new Date("2026-07-28T06:30:00.000Z"),
          },
          audit: {
            action: "same-key.probed",
            entity: "same-key-probe",
            entityId: "same-key-aggregate",
          },
          events: [
            {
              key: `${commandId}:event`,
              type: "same-key.probed",
              payload: { value: 42 },
            },
          ],
        };
      });

    const [first, second] = await Promise.all([execute(), execute()]);

    expect(handlerRuns).toBe(1);
    expect(first.commandId).toBe(second.commandId);
    expect(first.aggregateVersion).toBe(1);
    expect(second.aggregateVersion).toBe(1);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(first.result).toEqual(second.result);
    expect(first.result.completedAt).toBeInstanceOf(Date);
    expect(second.result.completedAt).toBeInstanceOf(Date);

    expect(await db.businessCommand.count()).toBe(1);
    expect(await db.domainEvent.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });

  it("still rejects changed content after the queued leader commits", async () => {
    let releaseLeader!: () => void;
    const leaderCanCommit = new Promise<void>((resolve) => {
      releaseLeader = resolve;
    });
    let leaderEntered!: () => void;
    const leaderStarted = new Promise<void>((resolve) => {
      leaderEntered = resolve;
    });

    const baseCommand = {
      idempotencyKey: "simultaneous-changed-content-command",
      commandType: "test.simultaneous-changed-content",
      aggregate: {
        type: "same-key-probe",
        id: "changed-content-aggregate",
        expectedVersion: 0,
      },
      actor: "same-key-test",
      correlationId: "changed-content-correlation",
    } as const;

    const leader = executeBusinessCommand(
      context,
      { ...baseCommand, payload: { value: 1 } },
      async ({ commandId }) => {
        leaderEntered();
        await leaderCanCommit;
        return {
          result: { value: 1 },
          audit: {
            action: "same-key.changed-content-probed",
            entity: "same-key-probe",
            entityId: "changed-content-aggregate",
          },
          events: [
            {
              key: `${commandId}:event`,
              type: "same-key.changed-content-probed",
              payload: { value: 1 },
            },
          ],
        };
      },
    );

    await leaderStarted;
    const follower = executeBusinessCommand(
      context,
      { ...baseCommand, payload: { value: 2 } },
      async () => {
        throw new Error("changed-content follower handler must not run");
      },
    );
    releaseLeader();

    await expect(leader).resolves.toMatchObject({ replayed: false });
    await expect(follower).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.businessCommand.count()).toBe(1);
  });
});
