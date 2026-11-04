process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Worker-level idle contract (F-0031): ten ticks of the automation worker on a
 * database with nothing queued perform ZERO `$transaction` calls. A positive
 * control proves the spy really sits on the worker's database client.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { TransactionSpy } from "@/lib/data/__tests__/transaction-spy";
import { LIFECYCLE_BRIDGE_EFFECT_TYPES } from "../lifecycle-bridge";

const hoisted = vi.hoisted(() => ({
  spy: null as TransactionSpy<object> | null,
  success: vi.fn(),
  failure: vi.fn(),
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  const { spyOnTransactions } = await import(
    "@/lib/data/__tests__/transaction-spy"
  );
  hoisted.spy = spyOnTransactions(actual.db as object);
  return { ...actual, db: hoisted.spy.client };
});
vi.mock("@/lib/license/license-authority", () => ({
  requireLicenseEntitlement: vi.fn(async () => undefined),
}));
vi.mock("@/lib/integrations/worker-health", () => ({
  recordWorkerSuccess: hoisted.success,
  recordWorkerFailure: hoisted.failure,
}));

import { startAutomationWorker } from "../worker";

function spy(): TransactionSpy<object> {
  if (!hoisted.spy) throw new Error("the mocked database module was not loaded");
  return hoisted.spy;
}

const WORKER_KEY = Symbol.for("sahelflow.automation-worker.v1");

function forgetWorker(): void {
  delete (globalThis as Record<symbol, unknown>)[WORKER_KEY];
}

/** Real-time wait (setImmediate is not faked) until `count` ticks settled. */
async function untilTicksSettled(count: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (hoisted.success.mock.calls.length + hoisted.failure.mock.calls.length < count) {
    if (Date.now() > deadline) throw new Error(`tick ${count} did not settle`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function runTicks(count: number): Promise<void> {
  startAutomationWorker();
  for (let tick = 1; tick <= count; tick += 1) {
    await vi.advanceTimersByTimeAsync(2_000);
    await untilTicksSettled(tick);
  }
}

beforeEach(async () => {
  forgetWorker();
  await cleanDb();
  spy().reset();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  forgetWorker();
});

describe("automation worker idle ticks", () => {
  it("ten idle ticks complete without error and perform zero $transaction calls", async () => {
    await runTicks(10);

    expect(hoisted.success).toHaveBeenCalledTimes(10);
    expect(hoisted.failure).not.toHaveBeenCalled();
    expect(spy().transactions()).toBe(0);
  });

  it("positive control: one exhausted lifecycle marker costs exactly one transaction in the tick", async () => {
    const commandId = `idleq-cmd-${randomUUID()}`;
    await rawDb.businessCommand.create({
      data: {
        id: commandId,
        idempotencyKey: commandId,
        commandType: "idleq.probe",
        aggregateType: "order",
        aggregateId: "idleq-order",
        requestHash: "a".repeat(64),
        status: "committed",
        actor: "idleq-test",
        correlationId: commandId,
        expectedVersion: 0,
        committedVersion: 1,
        committedAt: new Date(),
      },
    });
    const intentId = `idleq-intent-${randomUUID()}`;
    await rawDb.outboxIntent.create({
      data: {
        id: intentId,
        effectKey: intentId,
        commandId,
        effectType: (LIFECYCLE_BRIDGE_EFFECT_TYPES[0] ?? "order.fulfillment.shipped.v1"),
        payloadJson: "sealed-not-opened-by-the-claim",
        status: "queued",
        attemptCount: 6,
      },
    });

    await runTicks(1);

    expect(hoisted.failure).not.toHaveBeenCalled();
    expect(spy().transactions()).toBe(1);
    expect(
      (await rawDb.outboxIntent.findUniqueOrThrow({ where: { id: intentId } })).status,
    ).toBe("dead_letter");
  });
});
