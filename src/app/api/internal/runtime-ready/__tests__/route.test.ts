import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  dbRaw: {
    $queryRaw: mocks.queryRaw,
  },
}));

import { GET } from "../route";

const TOKEN = "a".repeat(64);
const INSTANCE_ID = "runtime-instance-1234";

function request(token?: string): Request {
  return new Request("http://127.0.0.1:49152/api/internal/runtime-ready", {
    headers: token ? { Authorization: "Bearer " + token } : undefined,
  });
}

describe("GET /api/internal/runtime-ready", () => {
  beforeEach(() => {
    process.env.SF_RUNTIME_TOKEN = TOKEN;
    process.env.SF_RUNTIME_INSTANCE_ID = INSTANCE_ID;
    process.env.SF_RUNTIME_PORT = "49152";
    process.env.APP_VERSION = "4.1.0-test";
    process.env.SF_ACTIVE_SHOP_ID = "default";
    process.env.SF_REGISTRY_REVISION = "7";
    process.env.SF_MIGRATION_SET_SHA256 = "f".repeat(64);
    mocks.queryRaw.mockResolvedValue([{ 1: 1 }]);
  });

  afterEach(() => {
    delete process.env.SF_RUNTIME_TOKEN;
    delete process.env.SF_RUNTIME_INSTANCE_ID;
    delete process.env.SF_RUNTIME_PORT;
    delete process.env.APP_VERSION;
    delete process.env.SF_ACTIVE_SHOP_ID;
    delete process.env.SF_REGISTRY_REVISION;
    delete process.env.SF_MIGRATION_SET_SHA256;
  });

  it("fails closed when the desktop did not configure the runtime", async () => {
    delete process.env.SF_RUNTIME_TOKEN;

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "blocked",
      code: "RUNTIME_NOT_CONFIGURED",
    });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("rejects a missing or incorrect per-launch credential", async () => {
    const missing = await GET(request());
    const incorrect = await GET(request("b".repeat(64)));

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("does not report ready when the configured database cannot be queried", async () => {
    mocks.queryRaw.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET(request(TOKEN));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "blocked",
      code: "RUNTIME_DATABASE_NOT_READY",
      checks: { database: "blocked" },
    });
  });

  it("binds readiness to the exact runtime instance", async () => {
    const response = await GET(request(TOKEN));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-sahelflow-runtime-instance")).toBe(INSTANCE_ID);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      protocolVersion: 1,
      instanceId: INSTANCE_ID,
      processId: process.pid,
      appVersion: "4.1.0-test",
      port: 49152,
      shopId: "default",
      registryRevision: 7,
      migrationSetSha256: "f".repeat(64),
      checks: {
        app: "ready",
        database: "ready",
        migration: "ready",
        registry: "ready",
        shop: "ready",
      },
    });
  });
});
