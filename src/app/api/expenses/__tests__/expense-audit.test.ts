import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MNY-11: creating and editing an expense left no audit trail (delete and
 * restore already wrote one), and PATCH could edit a soft-deleted expense that
 * the seller cannot see. The audit rows carry changed FIELD NAMES only, never
 * amounts or free text (same rule as the product edit audit).
 */

const harness = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  logAudit: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: harness.requireAuth }));
vi.mock("@/lib/audit", () => ({ logAudit: harness.logAudit }));
vi.mock("@/lib/identity/authorization", () => ({
  trustedActorAuditIdentity: () => ({ actorType: "member", actorId: "member-1" }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    expense: {
      create: harness.create,
      findUnique: harness.findUnique,
      update: harness.update,
    },
  },
  shopContext: { shopId: "shop-a" },
}));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));
vi.mock("@/lib/api/replay-guard", () => ({
  readReplayRequestId: () => null,
  withReplayGuard: async (
    _shopId: string,
    _requestId: string | null,
    run: () => Promise<Response>,
  ) => run(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/expenses/route";
import { PATCH } from "@/app/api/expenses/[id]/route";

const SECRET_NOTE = "paid cash to the landlord, do not share";

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/expenses", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function patch(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/expenses/exp-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const routeContext = { params: Promise.resolve({ id: "exp-1" }) };

beforeEach(() => {
  for (const mock of Object.values(harness)) mock.mockReset();
  harness.requireAuth.mockResolvedValue({ actor: { id: "member-1" } });
  harness.logAudit.mockResolvedValue(undefined);
  harness.create.mockResolvedValue({
    id: "exp-1",
    category: "rent",
    amount: 125_000,
    date: new Date("2026-10-01T00:00:00.000Z"),
    notes: SECRET_NOTE,
  });
  harness.findUnique.mockResolvedValue({ id: "exp-1", deletedAt: null });
  harness.update.mockResolvedValue({ id: "exp-1", category: "rent", amount: 99_999 });
});

describe("expense create and edit are audited (MNY-11)", () => {
  it("writes expense.created with field names only", async () => {
    const response = await POST(
      post({
        category: "rent",
        amount: 125_000,
        date: "2026-10-01T00:00:00.000Z",
        notes: SECRET_NOTE,
      }),
    );
    expect(response.status).toBe(201);
    expect(harness.logAudit).toHaveBeenCalledTimes(1);
    const entry = harness.logAudit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(entry).toMatchObject({
      action: "expense.created",
      entity: "expense",
      entityId: "exp-1",
      metadata: {
        changedFields: { category: true, amount: true, date: true, notes: true },
      },
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("125000");
    expect(serialized).not.toContain(SECRET_NOTE);
    expect(entry).not.toHaveProperty("before");
    expect(entry).not.toHaveProperty("after");
  });

  it("lists notes only when the create request actually carried notes", async () => {
    await POST(
      post({ category: "ads", amount: 5_000, date: "2026-10-02T00:00:00.000Z" }),
    );
    const entry = harness.logAudit.mock.calls[0]?.[1] as {
      metadata: { changedFields: Record<string, boolean> };
    };
    expect(Object.keys(entry.metadata.changedFields).sort()).toEqual([
      "amount",
      "category",
      "date",
    ]);
  });

  it("writes expense.updated with only the changed field names", async () => {
    const response = await PATCH(
      patch({ amount: 99_999, notes: SECRET_NOTE }),
      routeContext,
    );
    expect(response.status).toBe(200);
    expect(harness.logAudit).toHaveBeenCalledTimes(1);
    const entry = harness.logAudit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(entry).toMatchObject({
      action: "expense.updated",
      entity: "expense",
      entityId: "exp-1",
      metadata: { changedFields: { amount: true, notes: true } },
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("99999");
    expect(serialized).not.toContain(SECRET_NOTE);
  });

  it("writes no audit row when an edit changes nothing", async () => {
    await PATCH(patch({}), routeContext);
    expect(harness.logAudit).not.toHaveBeenCalled();
  });

  it("refuses to edit an expense the seller has deleted", async () => {
    harness.findUnique.mockResolvedValue({
      id: "exp-1",
      deletedAt: new Date("2026-10-03T00:00:00.000Z"),
    });
    await expect(PATCH(patch({ amount: 1 }), routeContext)).rejects.toThrow();
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.logAudit).not.toHaveBeenCalled();
  });
});
