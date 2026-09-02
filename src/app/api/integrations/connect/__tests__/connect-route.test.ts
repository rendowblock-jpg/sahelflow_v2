/**
 * POST /api/integrations/connect — ordering + compensation contract (audit S2-8).
 *
 * The Integration row must exist BEFORE any secret write, and a mid-way
 * secret-write failure must trigger compensating cleanup (delete the secrets
 * already written, deactivate the row) and surface a coded 502
 * CONNECT_PARTIAL_FAILURE — never a half-connected integration.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  actorContext: {
    version: 1,
    actor: {
      kind: "person" as const,
      personId: "1".repeat(32),
      workspaceMemberId: "2".repeat(32),
      deviceId: "3".repeat(32),
      sessionId: "connect-route-test-session",
      role: "owner" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "a".repeat(32),
      installationId: "b".repeat(32),
      shopId: "test",
      shopIncarnationId: "c".repeat(32),
      registryRevision: 1,
      databaseFileId: "test.db",
      migrationSetSha256: "0".repeat(64),
    },
  },
  requireAuth: vi.fn(),
  requireRecentReauthentication: vi.fn(async () => undefined),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(async () => undefined),
  logAudit: vi.fn(async () => undefined),
  integrationRows: [] as Array<Record<string, unknown>>,
  upsert: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: harness.requireAuth,
  requireRecentReauthentication: harness.requireRecentReauthentication,
}));

vi.mock("@/lib/secrets", () => ({
  setSecret: harness.setSecret,
  deleteSecret: harness.deleteSecret,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: harness.logAudit,
}));

vi.mock("@/lib/db", () => ({
  shopContext: harness.actorContext.shop,
  db: {
    // The route's $transaction callback receives a tx client carrying the
    // integration model — emulate that shape.
    $transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({ integration: { upsert: harness.upsert } }),
    integration: { updateMany: harness.updateMany },
  },
}));

import { POST } from "../route";

function connectRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/integrations/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  harness.requireAuth.mockReset().mockResolvedValue(harness.actorContext);
  harness.requireRecentReauthentication.mockReset().mockResolvedValue(undefined);
  harness.setSecret.mockReset().mockResolvedValue(undefined);
  harness.deleteSecret.mockClear();
  harness.logAudit.mockClear();
  harness.upsert.mockReset().mockResolvedValue({});
  harness.updateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("POST /api/integrations/connect — row-first ordering + compensation (audit S2-8)", () => {
  it("upserts the Integration row (with audit) before writing secrets", async () => {
    const response = await POST(
      connectRequest({ provider: "youcan", accessToken: "token-1" }),
    );
    expect(response.status).toBe(200);
    expect(harness.upsert).toHaveBeenCalledTimes(1);
    expect(harness.logAudit).toHaveBeenCalledTimes(1);
    expect(harness.setSecret).toHaveBeenCalledWith(
      expect.anything(),
      "ecommerce_youcan_accessToken",
      "token-1",
    );
  });

  it("compensates a partial secret write and returns coded 502 CONNECT_PARTIAL_FAILURE", async () => {
    harness.setSecret
      .mockResolvedValueOnce(undefined) // first secret written
      .mockRejectedValueOnce(new Error("sqlite disk I/O error")); // second fails

    const response = await POST(
      connectRequest({
        provider: "shopify",
        accessToken: "token-a",
        shopDomain: "shop.example.com",
      }),
    );
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ code: "CONNECT_PARTIAL_FAILURE" });
    // Compensation: the written secret is deleted and the row deactivated.
    expect(harness.deleteSecret).toHaveBeenCalledWith(
      expect.anything(),
      "ecommerce_shopify_accessToken",
    );
    expect(harness.updateMany).toHaveBeenCalledWith({
      where: { platform: "shopify" },
      data: { isActive: false },
    });
  });

  it("rejects oversized credential strings with coded 400 REQUEST_VALIDATION_FAILED", async () => {
    const response = await POST(
      connectRequest({
        provider: "woocommerce",
        consumerKey: "k".repeat(2049),
        consumerSecret: "s".repeat(16),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expect(harness.upsert).not.toHaveBeenCalled();
    expect(harness.setSecret).not.toHaveBeenCalled();
  });
});
