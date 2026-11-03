process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Worker-level idle contract (F-0031): ten ticks of the commerce-sync worker
 * with no store connected and nothing queued perform ZERO `$transaction` calls.
 * The positive control proves the spy sits on the worker's database client.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { TransactionSpy } from "@/lib/data/__tests__/transaction-spy";

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

// Loads the mocked database module now so the spy exists before the first tick
// (the worker itself imports it lazily).
import "@/lib/db";
import { startCommerceSyncWorker } from "../worker";

function spy(): TransactionSpy<object> {
  if (!hoisted.spy) throw new Error("the mocked database module was not loaded");
  return hoisted.spy;
}

const WORKER_KEY = Symbol.for("sahelflow.commerce-worker.v1");

function forgetWorker(): void {
  delete (globalThis as Record<symbol, unknown>)[WORKER_KEY];
}

async function untilTicksSettled(count: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (hoisted.success.mock.calls.length + hoisted.failure.mock.calls.length < count) {
    if (Date.now() > deadline) throw new Error(`tick ${count} did not settle`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function runTicks(count: number): Promise<void> {
  startCommerceSyncWorker();
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

describe("commerce-sync worker idle ticks", () => {
  it("ten idle ticks (no store connected) complete without error and perform zero $transaction calls", async () => {
    await runTicks(10);

    expect(hoisted.success).toHaveBeenCalledTimes(10);
    expect(hoisted.failure).not.toHaveBeenCalled();
    expect(spy().transactions()).toBe(0);
  });

  it("positive control: a queued run is claimed through the worker's own client", async () => {
    const id = `idleq-run-${randomUUID()}`;
    await rawDb.commerceSyncRun.create({
      data: {
        id,
        runKey: id,
        platform: "shopify",
        integrationId: "idleq-integration",
        sourceIdentity: "idleq-source",
        initialWatermark: "",
        status: "queued",
      },
    });

    await runTicks(1);

    expect(spy().transactions()).toBeGreaterThanOrEqual(1);
    expect(
      (await rawDb.commerceSyncRun.findUniqueOrThrow({ where: { id } })).attemptCount,
    ).toBeGreaterThanOrEqual(1);
  });
});
