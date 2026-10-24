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

describe("POST /api/integrations/connect — only declared secret fields (INT-13)", () => {
  const written = () =>
    harness.setSecret.mock.calls.map((call) => call[1] as string);
  const deleted = () =>
    harness.deleteSecret.mock.calls.map((call) => call[1] as string);

  it("does not store a supplied field the provider does not declare", async () => {
    const response = await POST(
      connectRequest({
        provider: "shopify",
        accessToken: "token-a",
        shopDomain: "shop.example.com",
        apiKey: "stray-key",
        consumerKey: "stray-consumer",
      }),
    );
    expect(response.status).toBe(200);
    expect(written()).toEqual([
      "ecommerce_shopify_accessToken",
      "ecommerce_shopify_shopDomain",
    ]);
  });

  it("ignores (does not reject) a malformed value in an undeclared field", async () => {
    const response = await POST(
      connectRequest({
        provider: "shopify",
        accessToken: "token-a",
        siteUrl: "not a url",
      }),
    );
    expect(response.status).toBe(200);
    expect(written()).toEqual(["ecommerce_shopify_accessToken"]);
  });

  it("still rejects a malformed siteUrl where the provider declares it", async () => {
    const response = await POST(
      connectRequest({
        provider: "woocommerce",
        siteUrl: "not a url",
        consumerKey: "ck",
        consumerSecret: "cs",
      }),
    );
    expect(response.status).toBe(400);
    expect(harness.setSecret).not.toHaveBeenCalled();
  });

  it("deletes a stored secret whose field the provider does not declare", async () => {
    const response = await POST(
      connectRequest({ provider: "shopify", accessToken: "token-a" }),
    );
    expect(response.status).toBe(200);
    expect(deleted()).toEqual(
      expect.arrayContaining([
        "ecommerce_shopify_apiKey",
        "ecommerce_shopify_apiToken",
        "ecommerce_shopify_apiId",
        "ecommerce_shopify_siteUrl",
        "ecommerce_shopify_consumerKey",
        "ecommerce_shopify_consumerSecret",
      ]),
    );
  });

  it("keeps a declared field the seller did not supply this time", async () => {
    const response = await POST(
      connectRequest({ provider: "shopify", accessToken: "token-b" }),
    );
    expect(response.status).toBe(200);
    expect(written()).toEqual(["ecommerce_shopify_accessToken"]);
    // shopDomain was stored earlier; retyping only the token must not touch it.
    expect(deleted()).not.toContain("ecommerce_shopify_shopDomain");
    expect(deleted()).not.toContain("ecommerce_shopify_accessToken");
  });

  it("never deletes a declared field of the provider being connected", async () => {
    const response = await POST(
      connectRequest({
        provider: "woocommerce",
        siteUrl: "https://shop.example.com",
        consumerKey: "ck",
      }),
    );
    expect(response.status).toBe(200);
    for (const key of [
      "ecommerce_woocommerce_siteUrl",
      "ecommerce_woocommerce_consumerKey",
      "ecommerce_woocommerce_consumerSecret",
    ]) {
      expect(deleted()).not.toContain(key);
    }
    expect(deleted()).toContain("ecommerce_woocommerce_accessToken");
  });

  it("still requires one declared credential: an undeclared field alone is a coded 400", async () => {
    const response = await POST(
      connectRequest({ provider: "youcan", apiKey: "stray-key" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "REQUEST_VALIDATION_FAILED",
    });
    expect(harness.upsert).not.toHaveBeenCalled();
    expect(harness.setSecret).not.toHaveBeenCalled();
    expect(harness.deleteSecret).not.toHaveBeenCalled();
  });
});
