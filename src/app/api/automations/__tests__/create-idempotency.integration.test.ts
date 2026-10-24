process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// INT-14: POST /api/automations with an idempotencyKey goes through the command kernel on a real SQLite database. A second request
// with the same key and the same content replays the same automation; the same key with other content is refused; without a key
// the route behaves as before. Stand-ins: the session (a fixed owner person) and next/headers. Everything else is real.
const authority = vi.hoisted(() => ({
  requireTrustedActor: vi.fn(),
  ownerContext: {
    version: 1,
    actor: {
      kind: "person" as const,
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "automation-create-session",
      role: "owner" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "default",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 1,
      databaseFileId: "default.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined })),
}));
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, requireTrustedActor: authority.requireTrustedActor, isTrustedActorContext: vi.fn(() => true) };
});

import { NextRequest } from "next/server";

import { POST } from "@/app/api/automations/route";
import { getJson, rawDb } from "@/app/api/__tests__/helpers";
import { canonicalizeAutomationMutation } from "@/lib/automations/contracts";
import { createAutomationOnce } from "@/lib/automations/create-command";
import { testAuthenticatedPersonBusinessPrincipal } from "@/lib/business-truth/principal";

const KEY_A = "3f2b8c1e-9d4a-4b7e-8a61-0c5d2e9f7a14";
const KEY_B = "9a1c4e7b-2d63-4f08-b5a9-7e3d1c6f8b20";

function body(extra: Record<string, unknown> = {}, name = "Confirmed order alert") {
  return {
    name,
    trigger: "order.confirmed",
    action: "send_notification",
    config: { messageTemplate: "Order {{orderNumber}} confirmed" },
    ...extra,
  };
}

function post(payload: unknown): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

async function clean(): Promise<void> {
  await rawDb.$executeRawUnsafe('DELETE FROM "DomainEvent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "ProjectionInvalidation"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessCommand"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessAggregateVersion"');
  await rawDb.auditLog.deleteMany();
  await rawDb.automationLog.deleteMany();
  await rawDb.automation.deleteMany();
}

beforeEach(async () => {
  authority.requireTrustedActor.mockReset().mockResolvedValue(authority.ownerContext);
  await clean();
});
afterAll(async () => {
  await clean();
  await rawDb.$disconnect();
});

describe("POST /api/automations with an idempotencyKey", () => {
  it("creates once and replays the same automation for the same key and content", async () => {
    const first = await post(body({ idempotencyKey: KEY_A }));
    const firstJson = await getJson(first);
    const second = await post(body({ idempotencyKey: KEY_A }));
    const secondJson = await getJson(second);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((firstJson.command as { replayed: boolean }).replayed).toBe(false);
    expect((secondJson.command as { replayed: boolean }).replayed).toBe(true);
    expect((secondJson.automation as { id: string }).id).toBe((firstJson.automation as { id: string }).id);
    expect(await rawDb.automation.count()).toBe(1);
    expect(Number((await rawDb.$queryRawUnsafe<Array<{ n: number | bigint }>>('SELECT COUNT(*) AS n FROM "BusinessCommand"'))[0]!.n)).toBe(1);
  });

  // At command level: two simultaneous requests through the route cannot be told apart from the session stand-in's own timing
  // (the second one never reaches it), so the same-moment case is proved on the command itself.
  it("creates one automation when the same key arrives twice at the same moment", async () => {
    const context = {
      prisma: rawDb as never,
      businessPrincipal: testAuthenticatedPersonBusinessPrincipal("5".repeat(32), "automation-create-session"),
    };
    const input = canonicalizeAutomationMutation(body());
    const [one, two] = await Promise.all([createAutomationOnce(context, KEY_A, input), createAutomationOnce(context, KEY_A, input)]);
    expect(two.result.automationId).toBe(one.result.automationId);
    expect([one.replayed, two.replayed].sort()).toEqual([false, true]);
    expect(await rawDb.automation.count()).toBe(1);
    expect(await rawDb.auditLog.count({ where: { action: "automation.created" } })).toBe(1);
  });

  it("creates two automations for two different keys", async () => {
    await post(body({ idempotencyKey: KEY_A }));
    await post(body({ idempotencyKey: KEY_B }));
    expect(await rawDb.automation.count()).toBe(2);
  });

  it("refuses the same key with different content and creates nothing more", async () => {
    await post(body({ idempotencyKey: KEY_A }));
    const refused = await post(body({ idempotencyKey: KEY_A }, "Another name"));
    expect(refused.status).toBe(409);
    expect(String((await getJson(refused)).error)).toContain("already bound to different command content");
    expect(await rawDb.automation.count()).toBe(1);
    expect(await rawDb.auditLog.count({ where: { action: "automation.created" } })).toBe(1);
  });

  it("writes the old audit entry once, with the same five facts, also on replay", async () => {
    const created = await getJson(await post(body({ idempotencyKey: KEY_A })));
    await post(body({ idempotencyKey: KEY_A }));
    const id = (created.automation as { id: string }).id;
    const entries = await rawDb.auditLog.findMany({ where: { action: "automation.created" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entity: "automation", entityId: id });
    expect(JSON.parse(entries[0]!.after!)).toEqual({
      // The kernel masks free text in every audit fact it stores; the row itself (entityId) holds the real name.
      name: "[REDACTED]",
      trigger: "order.confirmed",
      action: "send_notification",
      isActive: true,
      dryRun: false,
    });
  });

  it("refuses a key that is not a UUID and writes nothing", async () => {
    for (const bad of ["not-a-key", "", 7, null]) {
      const response = await post(body({ idempotencyKey: bad }));
      expect(response.status).toBe(400);
    }
    expect(await rawDb.automation.count()).toBe(0);
    expect(await rawDb.auditLog.count()).toBe(0);
  });
});

describe("POST /api/automations without a key (unchanged)", () => {
  it("creates one row per request, writes the audit entry and no command record", async () => {
    const first = await post(body());
    const second = await post(body());
    expect(first.status).toBe(201);
    expect(Object.keys(await getJson(first))).toEqual(["automation"]);
    expect(second.status).toBe(201);
    expect(await rawDb.automation.count()).toBe(2);
    expect(await rawDb.auditLog.count({ where: { action: "automation.created" } })).toBe(2);
    const commands = await rawDb.$queryRawUnsafe<Array<{ n: number | bigint }>>('SELECT COUNT(*) AS n FROM "BusinessCommand"');
    expect(Number(commands[0]!.n)).toBe(0);
  });
});
