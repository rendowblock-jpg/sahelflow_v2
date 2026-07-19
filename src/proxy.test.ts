import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const TOKEN = "e".repeat(64);

describe("runtime proxy boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SF_RUNTIME_APP_TOKEN", TOKEN);
    vi.stubEnv("SF_AUTH_MODE", "setup");
    vi.stubEnv("AUTH_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests without the per-launch cookie before setup mode", async () => {
    const response = await proxy(new NextRequest("http://127.0.0.1:49152/setup"));
    expect(response.status).toBe(401);
  });

  it("allows genuine setup with a matching per-launch cookie", async () => {
    const response = await proxy(new NextRequest("http://127.0.0.1:49152/setup", {
      headers: { cookie: `sf_runtime=${TOKEN}` },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed in production when auth mode is missing or inconsistent", async () => {
    delete process.env.SF_AUTH_MODE;
    const missing = await proxy(new NextRequest("http://127.0.0.1:49152/setup", {
      headers: { cookie: `sf_runtime=${TOKEN}` },
    }));
    expect(missing.status).toBe(503);

    process.env.SF_AUTH_MODE = "setup";
    process.env.AUTH_SECRET = "unexpected-secret";
    const inconsistent = await proxy(new NextRequest("http://127.0.0.1:49152/setup", {
      headers: { cookie: `sf_runtime=${TOKEN}` },
    }));
    expect(inconsistent.status).toBe(503);
    await expect(inconsistent.json()).resolves.toMatchObject({
      code: "AUTH_RUNTIME_MISCONFIGURED",
    });
  });

  it("requires a secret for configured mode", async () => {
    process.env.SF_AUTH_MODE = "configured";
    delete process.env.AUTH_SECRET;
    const response = await proxy(new NextRequest("http://127.0.0.1:49152/dashboard", {
      headers: { cookie: `sf_runtime=${TOKEN}` },
    }));
    expect(response.status).toBe(503);
  });

  it("leaves browser development unchanged when no runtime token exists", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.SF_RUNTIME_APP_TOKEN;
    delete process.env.SF_AUTH_MODE;
    delete process.env.AUTH_SECRET;
    const response = await proxy(new NextRequest("http://localhost:3000/setup"));
    expect(response.status).toBe(200);
  });
});
