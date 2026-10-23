/**
 * The scheduled-reconcile WORKER (INT-03): when it starts, that it never overlaps itself, how a
 * cycle's outcome becomes worker health, and that a shop that is not entitled pulls nothing.
 * The cycle's own rules are in scheduled-reconcile.integration.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SahelFlowError } from "@/types/errors";
import {
  __resetBackgroundWorkerHealthForTests,
  getBackgroundWorkerHealth,
} from "../worker-health";
import { startScheduledReconcileWorker } from "../reconcile-worker";

const WORKER_KEY = Symbol.for("sahelflow.scheduled-reconcile-worker.v1");

const harness = vi.hoisted(() => ({
  entitlement: vi.fn(),
  run: vi.fn(),
  dbMarker: { marker: "process-db" },
  shopMarker: { marker: "shop-context" },
}));

vi.mock("@/lib/db", () => ({
  db: harness.dbMarker,
  shopContext: harness.shopMarker,
}));
vi.mock("@/lib/license/license-authority", () => ({
  requireLicenseEntitlement: harness.entitlement,
}));
vi.mock("@/lib/integrations/scheduled-reconcile", () => ({
  newReconcileState: () => ({ courierCursor: null, lastCourierAt: 0, lastCommerceAt: {} }),
  runScheduledReconcile: harness.run,
}));
vi.mock("@/lib/delivery/canonical-courier", () => ({
  synchronizeCanonicalCourierTracking: vi.fn(),
}));
vi.mock("@/lib/integrations/ecommerce/queue", () => ({ queueCommerceSync: vi.fn() }));
vi.mock("@/lib/integrations/ecommerce", () => ({ loadEcommerceCredentials: vi.fn() }));

function report(over: {
  attempted?: number;
  synced?: number;
  queued?: string[];
  commerceFailed?: number;
}) {
  return {
    courier: {
      ran: true,
      attempted: over.attempted ?? 0,
      synced: over.synced ?? 0,
      failed: (over.attempted ?? 0) - (over.synced ?? 0),
      stoppedProviders: [],
      failureCodes: {},
    },
    commerce: {
      queued: over.queued ?? [],
      failed: over.commerceFailed ?? 0,
      failureCodes: {},
    },
  };
}

/** Real IO (dynamic imports) is not faked; only the timers are. */
async function settle(): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

function health() {
  return getBackgroundWorkerHealth().find((w) => w.worker === "scheduled-reconcile")!;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  delete (globalThis as Record<symbol, unknown>)[WORKER_KEY];
  __resetBackgroundWorkerHealthForTests();
  harness.entitlement.mockReset().mockResolvedValue(undefined);
  harness.run.mockReset().mockResolvedValue(report({}));
});
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[WORKER_KEY];
  vi.useRealTimers();
});

describe("scheduled reconcile worker", () => {
  it("waits 90 seconds after start, then ticks every minute", async () => {
    startScheduledReconcileWorker();

    await advance(89_999);
    expect(harness.run).not.toHaveBeenCalled();
    await advance(1);
    expect(harness.run).toHaveBeenCalledTimes(1);
    await advance(59_999);
    expect(harness.run).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(harness.run).toHaveBeenCalledTimes(2);
  });

  it("starts only once however many times it is asked", async () => {
    startScheduledReconcileWorker();
    startScheduledReconcileWorker();
    startScheduledReconcileWorker();

    await advance(90_000);

    expect(harness.run).toHaveBeenCalledTimes(1);
  });

  it("never runs two cycles at once", async () => {
    let finish: (value: ReturnType<typeof report>) => void = () => undefined;
    harness.run.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    startScheduledReconcileWorker();

    await advance(90_000);
    expect(harness.run).toHaveBeenCalledTimes(1);
    await advance(180_000);
    expect(harness.run).toHaveBeenCalledTimes(1);
    finish(report({}));
    await settle();
    await advance(60_000);
    expect(harness.run).toHaveBeenCalledTimes(2);
  });

  it("runs the cycle on the exact process database and shop context, after the licence check", async () => {
    startScheduledReconcileWorker();
    await advance(90_000);

    expect(harness.entitlement).toHaveBeenCalledWith(undefined, harness.shopMarker);
    expect(harness.run.mock.calls[0]![0]).toEqual({
      prisma: harness.dbMarker,
      shop: harness.shopMarker,
    });
    expect(harness.entitlement.mock.invocationCallOrder[0]!).toBeLessThan(
      harness.run.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps one cycle state for the whole run, so the sweep can walk on", async () => {
    startScheduledReconcileWorker();
    await advance(90_000);
    await advance(60_000);

    expect(harness.run.mock.calls[0]![1]).toBe(harness.run.mock.calls[1]![1]);
  });

  it("pulls nothing and reports a failure code when the shop is not entitled", async () => {
    harness.entitlement.mockRejectedValue(new SahelFlowError("expired", "LICENSE_EXPIRED", 403));
    startScheduledReconcileWorker();

    await advance(90_000);

    expect(harness.run).not.toHaveBeenCalled();
    expect(health()).toMatchObject({ status: "failing", lastFailureCode: "LICENSE_EXPIRED" });
    // and it tries again on the next tick instead of dying
    await advance(60_000);
    expect(harness.entitlement).toHaveBeenCalledTimes(2);
  });

  it("is idle when a cycle had nothing to do", async () => {
    harness.run.mockResolvedValue(report({}));
    startScheduledReconcileWorker();
    await advance(90_000);
    expect(health().status).toBe("idle");
  });

  it("is ok when at least part of a cycle worked", async () => {
    harness.run.mockResolvedValue(report({ attempted: 3, synced: 1 }));
    startScheduledReconcileWorker();
    await advance(90_000);
    expect(health()).toMatchObject({ status: "ok", consecutiveFailures: 0 });
  });

  it("is ok when only a commerce sync was queued", async () => {
    harness.run.mockResolvedValue(report({ queued: ["shopify"] }));
    startScheduledReconcileWorker();
    await advance(90_000);
    expect(health().status).toBe("ok");
  });

  it("is failing, with one summary code, when every attempt of a cycle failed", async () => {
    harness.run.mockResolvedValue(report({ attempted: 3, synced: 0, commerceFailed: 1 }));
    startScheduledReconcileWorker();
    await advance(90_000);
    expect(health()).toMatchObject({
      status: "failing",
      lastFailureCode: "RECONCILE_ALL_FAILED",
    });
  });

  it("is failing when the only thing attempted was a commerce queue that failed", async () => {
    harness.run.mockResolvedValue(report({ commerceFailed: 2 }));
    startScheduledReconcileWorker();
    await advance(90_000);
    expect(health()).toMatchObject({ status: "failing", lastFailureCode: "RECONCILE_ALL_FAILED" });
  });

  it("recovers: a good cycle after a failed one clears the failure count", async () => {
    harness.run
      .mockRejectedValueOnce(new SahelFlowError("x", "PROVIDER_DOWN", 503))
      .mockResolvedValue(report({ attempted: 1, synced: 1 }));
    startScheduledReconcileWorker();

    await advance(90_000);
    expect(health()).toMatchObject({ status: "failing", consecutiveFailures: 1 });
    await advance(60_000);
    expect(health()).toMatchObject({ status: "ok", consecutiveFailures: 0 });
  });
});
