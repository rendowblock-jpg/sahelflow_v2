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
const AUTH_SECRET = "canonical-auth-secret";

function request(token?: string): Request {
  return new Request("http://127.0.0.1:49152/api/internal/runtime-ready", {
    headers: token ? { Authorization: "Bearer " + token } : undefined,
  });
}

function mockConfiguredDatabase(secret = AUTH_SECRET): void {
  mocks.queryRaw
    .mockResolvedValueOnce([{
      id: "default",
      pinHash: "pbkdf2-hash",
      secret,
    }])
    .mockResolvedValueOnce([{ 1: 1 }]);
}

describe("GET /api/internal/runtime-ready", () => {
  beforeEach(() => {
    process.env.SF_RUNTIME_TOKEN = TOKEN;
    process.env.SF_RUNTIME_INSTANCE_ID = INSTANCE_ID;
    process.env.SF_RUNTIME_PORT = "49152";
    process.env.APP_VERSION = "4.1.0-test";
    process.env.SF_WORKSPACE_ID = "a".repeat(32);
    process.env.SF_INSTALLATION_ID = "b".repeat(32);
    process.env.SF_ACTIVE_SHOP_ID = "default";
    process.env.SF_SHOP_INCARNATION_ID = "c".repeat(32);
    process.env.SF_DATABASE_FILE_ID = "dev.db";
    process.env.SF_REGISTRY_REVISION = "7";
    process.env.SF_MIGRATION_SET_SHA256 = "f".repeat(64);
    process.env.SF_AUTH_MODE = "configured";
    process.env.AUTH_SECRET = AUTH_SECRET;
    mocks.queryRaw.mockReset();
    mockConfiguredDatabase();
  });

  afterEach(() => {
    delete process.env.SF_RUNTIME_TOKEN;
    delete process.env.SF_RUNTIME_INSTANCE_ID;
    delete process.env.SF_RUNTIME_PORT;
    delete process.env.APP_VERSION;
    delete process.env.SF_WORKSPACE_ID;
    delete process.env.SF_INSTALLATION_ID;
    delete process.env.SF_ACTIVE_SHOP_ID;
    delete process.env.SF_SHOP_INCARNATION_ID;
    delete process.env.SF_DATABASE_FILE_ID;
    delete process.env.SF_REGISTRY_REVISION;
    delete process.env.SF_MIGRATION_SET_SHA256;
    delete process.env.SF_AUTH_MODE;
    delete process.env.AUTH_SECRET;
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
    mocks.queryRaw.mockReset();
    mocks.queryRaw
      .mockResolvedValueOnce([{
        id: "default",
        pinHash: "pbkdf2-hash",
        secret: AUTH_SECRET,
      }])
      .mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET(request(TOKEN));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "blocked",
      code: "RUNTIME_DATABASE_NOT_READY",
      checks: { database: "blocked", auth: "ready" },
    });
  });

  it("reports genuine setup only when the database and desktop mode agree", async () => {
    process.env.SF_AUTH_MODE = "setup";
    delete process.env.AUTH_SECRET;
    mocks.queryRaw.mockReset();
    mocks.queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ 1: 1 }]);

    const response = await GET(request(TOKEN));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authMode: "setup",
      checks: { auth: "ready", database: "ready" },
    });
  });

  it("blocks missing, corrupt, or mismatched configured auth", async () => {
    delete process.env.AUTH_SECRET;
    const missingSecret = await GET(request(TOKEN));
    expect(missingSecret.status).toBe(503);
    await expect(missingSecret.json()).resolves.toMatchObject({
      code: "RUNTIME_NOT_CONFIGURED",
    });

    process.env.AUTH_SECRET = AUTH_SECRET;
    mocks.queryRaw.mockReset();
    mocks.queryRaw.mockRejectedValueOnce(new Error("malformed schema"));
    const corrupt = await GET(request(TOKEN));
    expect(corrupt.status).toBe(503);
    await expect(corrupt.json()).resolves.toMatchObject({
      code: "RUNTIME_AUTH_DATABASE_INVALID",
      checks: { auth: "blocked" },
    });

    mocks.queryRaw.mockReset();
    mockConfiguredDatabase("different-database-secret");
    const mismatched = await GET(request(TOKEN));
    expect(mismatched.status).toBe(503);
    await expect(mismatched.json()).resolves.toMatchObject({
      code: "RUNTIME_AUTH_MISMATCH",
      checks: { auth: "blocked" },
    });
  });

  it("binds readiness to the exact runtime instance and auth mode", async () => {
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
      workspaceId: "a".repeat(32),
      installationId: "b".repeat(32),
      shopId: "default",
      shopIncarnationId: "c".repeat(32),
      databaseFileId: "dev.db",
      registryRevision: 7,
      migrationSetSha256: "f".repeat(64),
      authMode: "configured",
      checks: {
        app: "ready",
        database: "ready",
        migration: "ready",
        registry: "ready",
        shop: "ready",
        auth: "ready",
      },
    });
  });
});
