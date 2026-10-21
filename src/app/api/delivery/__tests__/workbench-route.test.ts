import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/delivery is the list of deliveries behind the deliveries screen. The route itself only does three
// things: it demands the deliveries.read permission, it turns the query string (page, pageSize, status, q) into
// numbers and texts, and it hands them, with the caller's trusted context, to the workbench, which decides what the
// caller may see and clamps the paging. What matters here is the handover: the right permission, the caller's own
// context reaching the workbench, and the query read the way it is read today.
//
// Real code under test: the route, withErrorHandler (so the status and body of each refusal are the real ones),
// SahelFlowError and the Phase 2 permission catalog and role table. Stand-ins: the identity layer (requireAuth),
// the workbench itself (getDeliveryWorkbenchPage: it reads the database and decides which fields each role may see,
// so its behaviour is NOT tested here) and the logger/monitoring hooks withErrorHandler calls (its shop-authority
// and licence hooks only run when NODE_ENV is production, so those two mocks are inert here and the production
// checks that run before requireAuth are NOT tested).
const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  workbench: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/deliveries/delivery-workbench", () => ({ getDeliveryWorkbenchPage: h.workbench }));
vi.mock("@/lib/db", () => ({
  db: { name: "the-prisma-client" },
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import * as route from "@/app/api/delivery/route";
import {
  PHASE2_ACTIONS,
  getPhase2PresetPermissions,
  hasPhase2Permission,
} from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

const { GET } = route;

const PERMISSION = "deliveries.read";
const SECRET_IN_ERROR = "SECRET-DB-PASSWORD-0003";
const ACTOR_CONTEXT = {
  actor: { kind: "person" as const, personId: "5".repeat(32), role: "operator" as const },
  shop: { shopId: "default" },
};
const PAGE_RESULT = {
  deliveries: [{ id: "d-1", trackingNumber: "YAL-0001" }],
  total: 1,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};

function get(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/delivery${query}`, { method: "GET" });
}

function firstCall(spy: { mock: { calls: unknown[][] } }): unknown[] {
  const first = spy.mock.calls[0];
  if (!first) throw new Error("the stand-in was never called");
  return first;
}

function queryPassed(): { page: number; pageSize: number; status?: string; q?: string } {
  return firstCall(h.workbench)[1] as { page: number; pageSize: number; status?: string; q?: string };
}

beforeEach(() => {
  h.requireAuth.mockReset().mockResolvedValue(ACTOR_CONTEXT);
  h.workbench.mockReset().mockResolvedValue({ ...PAGE_RESULT });
});

describe("GET /api/delivery: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports GET and no other HTTP verb", () => {
    expect(typeof route.GET).toBe("function");
    for (const verb of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(route, verb).not.toHaveProperty(verb);
    }
  });

  // requireAuth is a stand-in here, so it cannot notice a misspelt permission. The real catalog can: a name that is
  // not in it would fail closed for everybody, including the owner.
  it("demands a permission that really exists in the action catalog", () => {
    expect(PHASE2_ACTIONS as readonly string[]).toContain(PERMISSION);
  });

  it("demands the deliveries.read permission, once, and nothing else", async () => {
    await GET(get());
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
    expect(h.requireAuth).toHaveBeenCalledWith(PERMISSION);
  });

  // The route lets every preset role in; what each role then sees is decided inside the workbench.
  it("is open, in the preset role table, to the owner, the manager, the operator and the viewer", () => {
    const holders = (["owner", "manager", "operator", "viewer"] as const).filter((role) =>
      hasPhase2Permission(getPhase2PresetPermissions(role), PERMISSION),
    );
    expect(holders).toEqual(["owner", "manager", "operator", "viewer"]);
  });

  it("does not call the workbench for a caller without the permission, and passes the refusal on", async () => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("Forbidden", "ACTION_FORBIDDEN", 403));
    const response = await GET(get("?page=2"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.workbench).not.toHaveBeenCalled();
  });
});

describe("GET /api/delivery: the hand-over to the workbench", () => {
  it("hands the workbench the caller's own trusted context, the very object requireAuth returned", async () => {
    await GET(get());
    expect(h.workbench).toHaveBeenCalledTimes(1);
    expect(firstCall(h.workbench)[0]).toBe(ACTOR_CONTEXT);
  });

  it("answers 200 with the workbench's page unchanged", async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(PAGE_RESULT);
  });

  it("asks for page 1 with 25 per page, and no status filter and no search, when the query string is empty", async () => {
    await GET(get());
    const query = queryPassed();
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(25);
    expect(query.status).toBeUndefined();
    expect(query.q).toBeUndefined();
  });

  it("passes the page, the page size, the status and the search text from the query string", async () => {
    await GET(get("?page=3&pageSize=50&status=pending&q=abc%20def"));
    expect(queryPassed()).toEqual({ page: 3, pageSize: 50, status: "pending", q: "abc def" });
  });

  it("passes only those four fields to the workbench", async () => {
    await GET(get("?page=2&pageSize=10&status=all&q=x&deletedAt=1&role=owner&shopId=other"));
    expect(Object.keys(queryPassed()).sort()).toEqual(["page", "pageSize", "q", "status"]);
  });

  it("uses the first value when a parameter is repeated", async () => {
    await GET(get("?page=2&page=9&status=pending&status=all"));
    const query = queryPassed();
    expect(query.page).toBe(2);
    expect(query.status).toBe("pending");
  });

  it("answers a generic 500 that holds no secret when the workbench throws", async () => {
    h.workbench.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await GET(get());
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(SECRET_IN_ERROR);
  });

  it("passes a coded refusal from the workbench on with its own status", async () => {
    h.workbench.mockRejectedValue(new SahelFlowError("Not allowed to see deliveries", "ACTION_FORBIDDEN", 403));
    const response = await GET(get());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACTION_FORBIDDEN" });
  });
});

// OBSERVED, not endorsed. The route reads the numbers with parseInt and does no checking of its own: an unreadable
// number reaches the workbench as NaN, a negative or oversized one as it is. The workbench is meant to clamp the
// paging itself: reading src/lib/deliveries/delivery-workbench.ts (clampPage, clampPageSize) a page that is not a
// positive integer becomes 1, a page size that is not a positive integer becomes 25, and a page size is capped at
// 100. NO TEST COVERS THAT CLAMP: this file stubs the workbench, and the only other test that names it is a
// source-text contract test. So the safety of these inputs rests on code that is read, not tested. If the route is
// changed to validate the numbers, update these expectations.
describe("GET /api/delivery: OBSERVED reading of the numbers in the query string", () => {
  it.each([
    ["a word", "?page=abc", Number.NaN],
    ["an empty value", "?page=", Number.NaN],
    ["a number followed by letters (parseInt reads the digits)", "?page=10abc", 10],
    ["a decimal (parseInt cuts it)", "?page=2.9", 2],
    ["exponent notation (parseInt stops at the e)", "?page=1e3", 1],
    ["a negative number", "?page=-5", -5],
    ["zero", "?page=0", 0],
    ["a leading plus sign", "?page=%2B4", 4],
  ])("hands the workbench the page as parseInt reads %s", async (_label, query, expected) => {
    await GET(get(query));
    const { page } = queryPassed();
    if (Number.isNaN(expected)) expect(page).toBeNaN();
    else expect(page).toBe(expected);
  });

  it.each([
    ["a word", "?pageSize=abc", Number.NaN],
    ["an empty value", "?pageSize=", Number.NaN],
    ["a value above the workbench's cap of 100 (the route does not cap it)", "?pageSize=1000", 1000],
    ["zero", "?pageSize=0", 0],
    ["a negative number", "?pageSize=-1", -1],
  ])("hands the workbench the page size as parseInt reads %s", async (_label, query, expected) => {
    await GET(get(query));
    const { pageSize } = queryPassed();
    if (Number.isNaN(expected)) expect(pageSize).toBeNaN();
    else expect(pageSize).toBe(expected);
  });

  it("hands an empty status and an empty search over as empty texts, not as undefined", async () => {
    await GET(get("?status=&q="));
    const query = queryPassed();
    expect(query.status).toBe("");
    expect(query.q).toBe("");
  });
});
