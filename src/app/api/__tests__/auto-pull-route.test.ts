/**
 * INT-03 off switch: GET/PUT /api/integrations/auto-pull.
 *
 * The route is the only way a seller turns the scheduled courier and shop pull off. What must hold:
 * the permission is per switch (couriers need the delivery permission, shops the integrations one),
 * a request that asks for two switches while holding one changes NOTHING, the stored text is exactly
 * what the reader (`loadAutoPullSwitches`) treats as off, and a change leaves one audit row.
 *
 * Identity is replaced by a permission set; the database, the settings table, the audit log and the
 * error handler are real.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SahelFlowError } from "@/types/errors";
import {
  DIRECT_ROUTE_TEST_AUTH_HEADER,
  DIRECT_ROUTE_TEST_AUTH_VALUE,
  rawDb,
} from "./helpers";

const harness = vi.hoisted(() => ({
  allowed: new Set<string>(),
  authenticated: true,
  actorContext: { shop: { shopId: "shop-a" }, actor: { kind: "person", personId: "p1" } },
}));

vi.mock("@/lib/identity/trusted-actor", async () => {
  const { SahelFlowError: Err } = await import("@/types/errors");
  return {
    requireTrustedActor: async () => {
      if (!harness.authenticated) {
        throw new Err("Trusted actor required", "TRUSTED_ACTOR_REQUIRED", 401);
      }
      return harness.actorContext;
    },
  };
});

vi.mock("@/lib/identity/authorization", async () => {
  const { SahelFlowError: Err } = await import("@/types/errors");
  return {
    assertTrustedAction: (_context: unknown, action: string) => {
      if (!harness.allowed.has(action)) {
        throw new Err(`Action ${action} is not permitted`, "ACTION_FORBIDDEN", 403);
      }
    },
    trustedActionAllowed: (_context: unknown, action: string) => harness.allowed.has(action),
    trustedActorAuditIdentity: () => "person:p1",
  };
});

import { GET, PUT } from "../integrations/auto-pull/route";
import {
  AUTO_PULL_COMMERCE_KEY,
  AUTO_PULL_COURIER_KEY,
  loadAutoPullSwitches,
} from "@/lib/integrations/scheduled-reconcile";

function request(method: "GET" | "PUT", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/integrations/auto-pull", {
    method,
    headers: {
      "Content-Type": "application/json",
      [DIRECT_ROUTE_TEST_AUTH_HEADER]: DIRECT_ROUTE_TEST_AUTH_VALUE,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function stored(key: string): Promise<string | null> {
  return (await rawDb.setting.findUnique({ where: { key } }))?.value ?? null;
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

const context = { prisma: rawDb as never };

beforeEach(async () => {
  harness.allowed = new Set();
  harness.authenticated = true;
  await rawDb.setting.deleteMany({
    where: { key: { in: [AUTO_PULL_COURIER_KEY, AUTO_PULL_COMMERCE_KEY] } },
  });
  await rawDb.auditLog.deleteMany({ where: { action: "auto_pull.updated" } });
});
afterAll(async () => {
  await rawDb.setting.deleteMany({
    where: { key: { in: [AUTO_PULL_COURIER_KEY, AUTO_PULL_COMMERCE_KEY] } },
  });
  await rawDb.auditLog.deleteMany({ where: { action: "auto_pull.updated" } });
  await rawDb.$disconnect();
});

describe("GET /api/integrations/auto-pull", () => {
  it("answers 401 with no signed-in actor", async () => {
    harness.authenticated = false;
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("reports both switches ON when nothing is stored, and what this actor may change", async () => {
    harness.allowed = new Set(["integrations.read", "integrations.manage"]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      switches: { courier: true, commerce: true },
      canManage: { courier: false, commerce: true },
    });
  });

  it("shows a stored 'false' as off", async () => {
    harness.allowed = new Set(["integrations.read"]);
    await rawDb.setting.create({ data: { key: AUTO_PULL_COURIER_KEY, value: "false" } });

    const body = await json(await GET());

    expect(body.switches).toEqual({ courier: false, commerce: true });
  });

  it("lets a delivery manager without integration rights read the switches", async () => {
    harness.allowed = new Set(["delivery.credentials.manage"]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect((await json(response)).canManage).toEqual({ courier: true, commerce: false });
  });

  it("refuses an actor who holds none of the three rights", async () => {
    harness.allowed = new Set(["orders.read"]);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await json(response)).toMatchObject({ code: "ACTION_FORBIDDEN" });
  });
});

describe("PUT /api/integrations/auto-pull", () => {
  it("answers 401 before it reads the body", async () => {
    harness.authenticated = false;
    const incoming = request("PUT", { courier: false });
    const spy = vi.spyOn(incoming, "json");

    const response = await PUT(incoming);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    expect(await stored(AUTO_PULL_COURIER_KEY)).toBeNull();
  });

  it("turns the courier pull off with the exact text the reader treats as off", async () => {
    harness.allowed = new Set(["delivery.credentials.manage"]);

    const response = await PUT(request("PUT", { courier: false }));

    expect(response.status).toBe(200);
    expect(await stored(AUTO_PULL_COURIER_KEY)).toBe("false");
    expect(await loadAutoPullSwitches(context)).toEqual({ courier: false, commerce: true });
    expect((await json(response)).switches).toEqual({ courier: false, commerce: true });
  });

  it("turns the shop pull off, and back on", async () => {
    harness.allowed = new Set(["integrations.manage"]);

    await PUT(request("PUT", { commerce: false }));
    expect(await loadAutoPullSwitches(context)).toEqual({ courier: true, commerce: false });

    const back = await PUT(request("PUT", { commerce: true }));
    expect(back.status).toBe(200);
    expect(await stored(AUTO_PULL_COMMERCE_KEY)).toBe("true");
    expect(await loadAutoPullSwitches(context)).toEqual({ courier: true, commerce: true });
  });

  it("leaves the other switch untouched", async () => {
    harness.allowed = new Set(["delivery.credentials.manage"]);

    await PUT(request("PUT", { courier: false }));

    expect(await stored(AUTO_PULL_COMMERCE_KEY)).toBeNull();
  });

  it("changes both in one request when the actor holds both rights", async () => {
    harness.allowed = new Set(["delivery.credentials.manage", "integrations.manage"]);

    const response = await PUT(request("PUT", { courier: false, commerce: false }));

    expect(response.status).toBe(200);
    expect(await loadAutoPullSwitches(context)).toEqual({ courier: false, commerce: false });
  });

  it("refuses the courier switch to someone who only manages integrations", async () => {
    harness.allowed = new Set(["integrations.manage", "integrations.read"]);

    const response = await PUT(request("PUT", { courier: false }));

    expect(response.status).toBe(403);
    expect(await stored(AUTO_PULL_COURIER_KEY)).toBeNull();
  });

  it("refuses the shop switch to someone who only manages couriers", async () => {
    harness.allowed = new Set(["delivery.credentials.manage"]);

    const response = await PUT(request("PUT", { commerce: false }));

    expect(response.status).toBe(403);
    expect(await stored(AUTO_PULL_COMMERCE_KEY)).toBeNull();
  });

  it("changes NOTHING when a two-switch request is only half permitted", async () => {
    harness.allowed = new Set(["delivery.credentials.manage"]);

    const response = await PUT(request("PUT", { courier: false, commerce: false }));

    expect(response.status).toBe(403);
    expect(await stored(AUTO_PULL_COURIER_KEY)).toBeNull();
    expect(await stored(AUTO_PULL_COMMERCE_KEY)).toBeNull();
    expect(await rawDb.auditLog.count({ where: { action: "auto_pull.updated" } })).toBe(0);
  });

  it.each([
    ["an empty object", {}],
    ["an unknown key", { courier: false, interval: 5 }],
    ["the text 'false' instead of a boolean", { courier: "false" }],
    ["the text 'False'", { courier: "False" }],
    ["a number", { commerce: 0 }],
    ["null", { courier: null }],
    ["an array", [false]],
    ["a bare string", "off"],
  ])("rejects %s with a 400 and writes nothing", async (_name, body) => {
    harness.allowed = new Set(["delivery.credentials.manage", "integrations.manage"]);

    const response = await PUT(request("PUT", body));

    expect(response.status).toBe(400);
    expect(await stored(AUTO_PULL_COURIER_KEY)).toBeNull();
    expect(await stored(AUTO_PULL_COMMERCE_KEY)).toBeNull();
  });

  it("rejects a body that is not JSON with a 400", async () => {
    harness.allowed = new Set(["delivery.credentials.manage"]);

    const response = await PUT(request("PUT", "{not json"));

    expect(response.status).toBe(400);
  });

  it("leaves one audit row with the before and after flags and who did it", async () => {
    harness.allowed = new Set(["delivery.credentials.manage"]);

    await PUT(request("PUT", { courier: false }));

    const rows = await rawDb.auditLog.findMany({ where: { action: "auto_pull.updated" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "settings", actor: "person:p1" });
    expect(JSON.parse(rows[0]!.before ?? "{}")).toEqual({ courier: true, commerce: true });
    expect(JSON.parse(rows[0]!.after ?? "{}")).toEqual({ courier: false, commerce: true });
    expect(JSON.parse(rows[0]!.metadata ?? "{}")).toEqual({
      courierChanged: true,
      commerceChanged: false,
    });
  });

  it("flags both switches in the audit row when both change", async () => {
    harness.allowed = new Set(["delivery.credentials.manage", "integrations.manage"]);

    await PUT(request("PUT", { courier: false, commerce: false }));

    const row = await rawDb.auditLog.findFirstOrThrow({ where: { action: "auto_pull.updated" } });
    expect(JSON.parse(row.metadata ?? "{}")).toEqual({
      courierChanged: true,
      commerceChanged: true,
    });
  });

  it("is a no-op for the stored value when asked for what is already true, and still answers 200", async () => {
    harness.allowed = new Set(["delivery.credentials.manage"]);
    await PUT(request("PUT", { courier: false }));

    const response = await PUT(request("PUT", { courier: false }));

    expect(response.status).toBe(200);
    expect(await stored(AUTO_PULL_COURIER_KEY)).toBe("false");
  });
});

describe("the two keys", () => {
  it("are the documented setting names, and are not reserved by the settings API", () => {
    expect(AUTO_PULL_COURIER_KEY).toBe("auto_pull_courier");
    expect(AUTO_PULL_COMMERCE_KEY).toBe("auto_pull_commerce");
  });

  it("can be written by the settings library (a reserved prefix would make the route fail)", async () => {
    const { setSetting } = await import("@/lib/settings");
    await expect(setSetting(context, AUTO_PULL_COURIER_KEY, "false")).resolves.toBeUndefined();
    await expect(setSetting(context, AUTO_PULL_COMMERCE_KEY, "true")).resolves.toBeUndefined();
    expect(SahelFlowError).toBeDefined();
  });
});
