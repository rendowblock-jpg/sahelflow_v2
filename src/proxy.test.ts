import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken } from "@/lib/auth/crypto";
import { proxy } from "./proxy";

const RUNTIME_TOKEN = "e".repeat(64);
const INSTANCE_ID = "a".repeat(32);
const AUTH_SECRET = "proxy-test-auth-secret";
// Self-hosted Next middleware deliberately exposes its server-populated
// canonical loopback hostname instead of trusting the request Host header. The
// installed WebView evidence likewise hydrates on localhost even though the
// native runtime endpoint is published as 127.0.0.1.
const CANONICAL_PROXY_ORIGIN = "http://localhost:49152";

type RequestOptions = Readonly<{
  method?: string;
  headers?: HeadersInit;
}>;

function request(
  pathname: string,
  init: RequestOptions = {},
  cookies: string[] = [`sf_runtime=${RUNTIME_TOKEN}`],
): NextRequest {
  const headers = new Headers(init.headers);
  if (!headers.has("host")) headers.set("host", "127.0.0.1:49152");
  if (cookies.length > 0) headers.set("cookie", cookies.join("; "));
  return new NextRequest(`http://127.0.0.1:49152${pathname}`, {
    method: init.method,
    headers,
  });
}

describe("runtime proxy boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SF_RUNTIME_APP_TOKEN", RUNTIME_TOKEN);
    vi.stubEnv("SF_RUNTIME_TOKEN", RUNTIME_TOKEN);
    vi.stubEnv("SF_RUNTIME_INSTANCE_ID", INSTANCE_ID);
    vi.stubEnv("SF_AUTH_MODE", "setup");
    vi.stubEnv("AUTH_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests without the per-launch cookie before setup mode", async () => {
    const response = await proxy(request("/setup", {}, []));
    expect(response.status).toBe(401);
  });

  it("allows the exact setup ceremony with a matching runtime cookie", async () => {
    for (const pathname of [
      "/setup",
      "/api/auth/setup",
      "/api/auth/status",
      "/api/health",
      "/manifest.webmanifest",
      "/sw.js",
    ]) {
      const response = await proxy(request(pathname));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("rejects every non-setup API while setup is incomplete", async () => {
    for (const pathname of [
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/change-pin",
      "/api/auth/reauthenticate",
      "/api/orders",
      "/api/storefront/submit",
    ]) {
      const response = await proxy(request(pathname));
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "AUTH_SETUP_REQUIRED",
      });
    }
  });

  it("redirects non-setup pages with an absolute canonical loopback location", async () => {
    for (const pathname of [
      "/",
      "/login",
      "/orders",
      "/storefront/example",
      "/setup/profile",
    ]) {
      const response = await proxy(request(pathname));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `${CANONICAL_PROXY_ORIGIN}/setup`,
      );
    }
  });

  it("does not trust Host when constructing setup redirects", async () => {
    const response = await proxy(
      request("/", { headers: { host: "attacker.example" } }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${CANONICAL_PROXY_ORIGIN}/setup`,
    );
  });

  it("allows only exact loopback shutdown authority without browser cookies", async () => {
    const allowed = await proxy(
      new NextRequest(
        "http://127.0.0.1:49152/api/internal/runtime-shutdown",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${RUNTIME_TOKEN}`,
            "x-sahelflow-runtime-instance": INSTANCE_ID,
          },
        },
      ),
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("x-middleware-next")).toBe("1");

    for (const candidate of [
      new NextRequest(
        "http://127.0.0.1:49152/api/internal/runtime-shutdown",
        { method: "POST" },
      ),
      new NextRequest(
        "http://127.0.0.1:49152/api/internal/runtime-shutdown",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${RUNTIME_TOKEN}`,
            "x-sahelflow-runtime-instance": "b".repeat(32),
          },
        },
      ),
      new NextRequest(
        "http://192.0.2.10:49152/api/internal/runtime-shutdown",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${RUNTIME_TOKEN}`,
            "x-sahelflow-runtime-instance": INSTANCE_ID,
          },
        },
      ),
    ]) {
      const rejected = await proxy(candidate);
      expect(rejected.status).toBe(401);
      await expect(rejected.json()).resolves.toMatchObject({
        code: "RUNTIME_SHUTDOWN_CREDENTIAL_REJECTED",
      });
    }
  });

  it("fails closed when packaged auth mode is missing or inconsistent", async () => {
    delete process.env.SF_AUTH_MODE;
    const missing = await proxy(request("/setup"));
    expect(missing.status).toBe(503);

    process.env.SF_AUTH_MODE = "setup";
    process.env.AUTH_SECRET = "unexpected-secret";
    const inconsistent = await proxy(request("/setup"));
    expect(inconsistent.status).toBe(503);
    await expect(inconsistent.json()).resolves.toMatchObject({
      code: "AUTH_RUNTIME_MISCONFIGURED",
    });
  });

  it("requires a secret for configured mode", async () => {
    process.env.SF_AUTH_MODE = "configured";
    delete process.env.AUTH_SECRET;
    const response = await proxy(request("/dashboard"));
    expect(response.status).toBe(503);
  });

  it("allows only exact public APIs in configured mode", async () => {
    process.env.SF_AUTH_MODE = "configured";
    process.env.AUTH_SECRET = AUTH_SECRET;

    for (const pathname of [
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/setup",
      "/api/auth/status",
      "/api/health",
      "/api/storefront/submit",
      "/api/reports/daily",
    ]) {
      const response = await proxy(request(pathname));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }

    for (const pathname of [
      "/api/auth/change-pin",
      "/api/auth/reauthenticate",
      "/api/auth/status/private",
      "/api/orders",
    ]) {
      const response = await proxy(request(pathname));
      expect(response.status).toBe(401);
    }
  });

  it("keeps login and setup descendants protected with an absolute redirect", async () => {
    process.env.SF_AUTH_MODE = "configured";
    process.env.AUTH_SECRET = AUTH_SECRET;

    for (const pathname of ["/login/recovery", "/setup/profile"]) {
      const response = await proxy(request(pathname));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `${CANONICAL_PROXY_ORIGIN}/login`,
      );
    }
  });

  it("allows a protected route only with a valid signed seller cookie", async () => {
    process.env.SF_AUTH_MODE = "configured";
    process.env.AUTH_SECRET = AUTH_SECRET;
    const sellerToken = await createSessionToken(
      AUTH_SECRET,
      60_000,
      "session-1",
    );

    const response = await proxy(
      request("/api/orders", {}, [
        `sf_runtime=${RUNTIME_TOKEN}`,
        `sf_session=${sellerToken}`,
      ]),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("contains browser development setup when no runtime token exists", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.SF_RUNTIME_APP_TOKEN;
    delete process.env.SF_AUTH_MODE;
    delete process.env.AUTH_SECRET;

    expect((await proxy(request("/setup", {}, []))).status).toBe(200);
    expect((await proxy(request("/api/orders", {}, []))).status).toBe(409);
    expect((await proxy(request("/login", {}, []))).status).toBe(307);
  });
});