import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HOST_TIME_ZONES, useHostTimeZone } from "@/test-utils/host-tz";

/**
 * MNY-13: the ?month=YYYY-MM filter cut the month at UTC midnight, so an
 * expense written at 00:30 on 1 November in Algeria (23:30 UTC on 31 October)
 * showed up in October. The month is a shop-time month (UTC+1).
 */
const harness = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: harness.requireAuth }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/identity/authorization", () => ({
  trustedActorAuditIdentity: () => ({ actorType: "member", actorId: "member-1" }),
}));
vi.mock("@/lib/db", () => ({
  db: { expense: { findMany: harness.findMany } },
  shopContext: { shopId: "shop-a" },
}));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));
vi.mock("@/lib/api/replay-guard", () => ({
  readReplayRequestId: () => null,
  withReplayGuard: async (_s: string, _r: string | null, run: () => Promise<Response>) => run(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/expenses/route";

function list(month: string): NextRequest {
  return new NextRequest(`http://localhost/api/expenses?month=${month}`);
}

describe.each(HOST_TIME_ZONES)("GET /api/expenses month filter, host set to %s", (zone) => {
  useHostTimeZone(zone);

  beforeEach(() => {
    harness.requireAuth.mockReset().mockResolvedValue(undefined);
    harness.findMany.mockReset().mockResolvedValue([]);
  });

  it("October runs from 1 Oct 00:00 to 1 Nov 00:00 Algeria time", async () => {
    await GET(list("2026-10"), undefined as never);
    const where = harness.findMany.mock.calls[0]![0].where;
    expect(where.date.gte.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(where.date.lt.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("December rolls over to January of the next year", async () => {
    await GET(list("2026-12"), undefined as never);
    const where = harness.findMany.mock.calls[0]![0].where;
    expect(where.date.gte.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(where.date.lt.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("a malformed month lists unfiltered", async () => {
    await GET(list("2026-13"), undefined as never);
    expect(harness.findMany.mock.calls[0]![0].where).toEqual({ deletedAt: null });
  });
});
