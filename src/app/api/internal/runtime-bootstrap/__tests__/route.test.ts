import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { GET, resetRuntimeBootstrapForTest } from "../route";

const TOKEN = "c".repeat(64);

describe("GET /api/internal/runtime-bootstrap", () => {
  beforeEach(() => {
    process.env.SF_RUNTIME_APP_TOKEN = TOKEN;
    resetRuntimeBootstrapForTest();
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.SF_AUTH_MODE;
    delete process.env.SF_RUNTIME_APP_TOKEN;
    resetRuntimeBootstrapForTest();
  });

  it("rejects a missing or incorrect launch credential", async () => {
    const missing = await GET(new Request("http://127.0.0.1:49152/api/internal/runtime-bootstrap"));
    const wrong = await GET(new Request(`http://127.0.0.1:49152/api/internal/runtime-bootstrap?token=${"d".repeat(64)}`));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  it("commits the fallback cookie before a CSP-compatible external handoff and consumes the bootstrap", async () => {
    const request = new Request(`http://127.0.0.1:49152/api/internal/runtime-bootstrap?token=${TOKEN}`);
    const accepted = await GET(request);
    const body = await accepted.text();
    const replay = await GET(request);
    const csp = accepted.headers.get("content-security-policy") ?? "";

    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("location")).toBeNull();
    expect(accepted.headers.get("content-type")).toContain("text/html");
    expect(accepted.headers.get("set-cookie")).toContain("sf_runtime=");
    expect(accepted.headers.get("set-cookie")?.toLowerCase()).toContain("httponly");
    expect(accepted.headers.get("set-cookie")?.toLowerCase()).toContain("samesite=strict");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(body).toContain('<script src="/runtime-bootstrap-handoff.js" defer></script>');
    expect(body).not.toContain("window.location.replace");
    expect(replay.status).toBe(410);
  });

  it("allows only the exact loopback handoff asset before the launch cookie exists", async () => {
    process.env.SF_AUTH_MODE = "configured";
    process.env.AUTH_SECRET = "e".repeat(64);

    const handoff = await proxy(
      new NextRequest("http://127.0.0.1:49152/runtime-bootstrap-handoff.js"),
    );
    const unrelatedScript = await proxy(
      new NextRequest("http://127.0.0.1:49152/unrelated.js"),
    );
    const nonLoopbackHandoff = await proxy(
      new NextRequest("http://example.com/runtime-bootstrap-handoff.js"),
    );

    expect(handoff.headers.get("x-middleware-next")).toBe("1");
    expect(unrelatedScript.status).toBe(401);
    expect(nonLoopbackHandoff.status).toBe(401);
  });

  it("does not bootstrap on a non-loopback host", async () => {
    const response = await GET(new Request(`http://example.com/api/internal/runtime-bootstrap?token=${TOKEN}`));
    expect(response.status).toBe(404);
  });
});
