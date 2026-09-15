/**
 * FD-061 EX-3 sandbox DB tests for the CAPI outbox effect runtime.
 *
 * The register names the required matrix exactly: claim idempotency, the
 * 5×30 s retry matrix, 4xx terminal failure and the 7-day attribution skip.
 * All cases run against the real SQLite schema (real ledger claims, real
 * encrypted Secret authority) with only the Meta HTTP edge stubbed — the
 * stub rides vi.stubGlobal, so vitest's unstubGlobals keeps it file-local.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { createTestPrisma, makeContext, seedOrder } from "@/lib/data/__tests__/helpers";
import {
  META_CAPI_TOKEN_SECRET_KEY,
  queueCapiStage,
  upsertMetaPixelConfig,
} from "@/lib/meta/capi-authority";
import { drainDueCapiSends } from "@/lib/meta/capi-effect-runtime";
import { setSecret } from "@/lib/secrets";
import type { ServiceContext } from "@/lib/data/service-base";

let db: PrismaClient;
let context: ServiceContext;

beforeEach(async () => {
  db = await createTestPrisma();
  // The shared cleaner predates the EX-3 tables; clear them explicitly so
  // every case starts from an empty ledger.
  await db.capiAttemptLog.deleteMany();
  await db.capiEventLedger.deleteMany();
  await db.metaPixelConfig.deleteMany();
  context = makeContext(db);
  await upsertMetaPixelConfig(context, {
    pixelId: "1234567890",
    enabled: true,
    conversionEvent: "Purchase",
  });
  await setSecret(context, META_CAPI_TOKEN_SECRET_KEY, "EAAG-test-token");
});

afterEach(async () => {
  await db.$disconnect();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Seed an order and trigger its checkout stage through the real gate. */
async function queueCheckoutOrder(): Promise<string> {
  const order = await seedOrder(db);
  const disposition = await queueCapiStage(context, {
    orderId: order.id,
    stage: "checkout",
    triggeredAt: new Date(),
  });
  expect(disposition.queued).toBe(true);
  return order.id;
}

async function loadLedger(orderId: string) {
  return db.capiEventLedger.findUnique({
    where: {
      orderId_stage_eventName: { orderId, stage: "checkout", eventName: "Purchase" },
    },
  });
}

async function rewindLedgerLease(orderId: string) {
  // Simulate the passage of the backoff window: the drain only picks
  // claims whose leaseUntil is due.
  await db.capiEventLedger.updateMany({
    where: { orderId },
    data: { leaseUntil: new Date(Date.now() - 5_000) },
  });
}

function dueMs(leaseUntil: Date | null): number {
  if (!leaseUntil) throw new Error("leaseUntil missing on a live claim");
  return leaseUntil.getTime();
}

describe("CAPI outbox effect runtime (FD-061 EX-3)", () => {
  it("claim idempotency: one trigger wins the claim and a resolved ledger never re-sends", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const orderId = await queueCheckoutOrder();

    // A second trigger of the same business conversion loses the claim.
    const second = await queueCapiStage(context, {
      orderId,
      stage: "checkout",
      triggeredAt: new Date(),
    });
    expect(second).toEqual({ queued: false, reason: "already_claimed" });

    // Exactly one ledger claim exists and it is born due.
    const ledger = await loadLedger(orderId);
    if (!ledger) throw new Error("ledger claim row missing after trigger");
    expect(ledger.status).toBe("claimed");
    expect(ledger.attempts).toBe(0);
    expect(dueMs(ledger.leaseUntil)).toBeLessThanOrEqual(Date.now());

    // Simulate a completed send, then drain: a sent claim is never due.
    await db.capiEventLedger.update({
      where: { id: ledger.id },
      data: { status: "sent", sentAt: new Date() },
    });
    const outcome = await drainDueCapiSends(context);
    expect(outcome.processed).toBe(0);
    expect(outcome.sent).toBe(0);
    expect(outcome.skipped).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();

    // The resolved claim still blocks any re-claim.
    const third = await queueCapiStage(context, {
      orderId,
      stage: "checkout",
      triggeredAt: new Date(),
    });
    expect(third).toEqual({ queued: false, reason: "already_claimed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retry matrix: network failure backs off 30 s×2^(n-1) and is terminal at the 5th attempt", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network unreachable");
    });
    vi.stubGlobal("fetch", fetchMock);
    const orderId = await queueCheckoutOrder();

    // Passes 1..4: retryable — the claim stays live and reschedules itself.
    for (let pass = 1; pass <= 4; pass += 1) {
      await rewindLedgerLease(orderId);
      const outcome = await drainDueCapiSends(context);
      expect(outcome.retried).toBe(1);
      expect(outcome.failed).toBe(0);

      const ledger = await loadLedger(orderId);
      if (!ledger) throw new Error("ledger claim row missing during retry pass");
      expect(ledger.status).toBe("claimed");
      expect(ledger.attempts).toBe(pass);
      const expectedDelayMs = 30_000 * 2 ** (pass - 1);
      const deltaMs = dueMs(ledger.leaseUntil) - Date.now();
      expect(Math.abs(deltaMs - expectedDelayMs)).toBeLessThan(3_000);
    }

    // Pass 5: the matrix is exhausted — terminal failure record.
    await rewindLedgerLease(orderId);
    const outcome = await drainDueCapiSends(context);
    expect(outcome.failed).toBe(1);
    expect(outcome.retried).toBe(0);

    const ledger = await loadLedger(orderId);
    expect(ledger?.status).toBe("failed");
    expect(ledger?.attempts).toBe(5);
    expect(ledger?.leaseUntil).toBeNull();
    expect(ledger?.sentAt).not.toBeNull();
    expect(ledger?.lastError).toContain("network unreachable");

    // One Meta call per drain pass, one audited attempt per pass.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const logs = await db.capiAttemptLog.findMany({ where: { orderId } });
    expect(logs).toHaveLength(5);
    expect(logs.filter((row) => row.status === "claimed")).toHaveLength(4);
    expect(logs.filter((row) => row.status === "failed")).toHaveLength(1);
  });

  it("4xx terminal: a Meta rejection fails the record immediately and never retries", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: "Invalid access token" } }, 400),
    );
    vi.stubGlobal("fetch", fetchMock);
    const orderId = await queueCheckoutOrder();

    const outcome = await drainDueCapiSends(context);
    expect(outcome.failed).toBe(1);
    expect(outcome.retried).toBe(0);
    expect(outcome.sent).toBe(0);

    const ledger = await loadLedger(orderId);
    expect(ledger?.status).toBe("failed");
    expect(ledger?.attempts).toBe(1);
    expect(ledger?.lastError).toBe("Invalid access token");
    expect(ledger?.leaseUntil).toBeNull();
    expect(ledger?.sentAt).not.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A terminal record is never due again — no retry, no second Meta call.
    const again = await drainDueCapiSends(context);
    expect(again.processed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const logs = await db.capiAttemptLog.findMany({ where: { orderId } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe("failed");
    expect(logs[0]?.httpStatus).toBe(400);
  });

  it("7-day skip: an expired event_time is audited and skipped without a Meta call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const order = await seedOrder(db);
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3_600 * 1_000);
    const disposition = await queueCapiStage(context, {
      orderId: order.id,
      stage: "checkout",
      triggeredAt: eightDaysAgo,
    });
    expect(disposition.queued).toBe(true);

    const outcome = await drainDueCapiSends(context);
    expect(outcome.skipped).toBe(1);
    expect(outcome.sent).toBe(0);
    expect(outcome.failed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();

    const ledger = await loadLedger(order.id);
    expect(ledger?.status).toBe("skipped");
    expect(ledger?.lastError).toContain("outside Meta 7-day window");
    expect(ledger?.sentAt).not.toBeNull();

    const logs = await db.capiAttemptLog.findMany({ where: { orderId: order.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe("expired");
  });
});
