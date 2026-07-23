import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GET,
  resetRuntimeBootstrapForTest,
} from "@/app/api/internal/runtime-bootstrap/route";

const token = "a".repeat(64);

function request(): Request {
  return new Request(
    `http://127.0.0.1:43123/api/internal/runtime-bootstrap?token=${token}`,
  );
}

describe("packaged runtime bootstrap WebView handoff", () => {
  beforeEach(() => {
    process.env.VITEST = "true";
    process.env.SF_RUNTIME_APP_TOKEN = token;
    resetRuntimeBootstrapForTest();
  });

  afterEach(() => {
    delete process.env.SF_RUNTIME_APP_TOKEN;
    delete process.env.VITEST;
  });

  it("commits the HttpOnly runtime cookie before navigating to the workspace", async () => {
    const response = await GET(request());
    const body = await response.text();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(setCookie).toContain(`sf_runtime=${token}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=strict");
    expect(setCookie).toContain("Path=/");
    expect(body).toContain('window.location.replace("/")');
  });

  it("remains one-time after the successful cookie handoff", async () => {
    expect((await GET(request())).status).toBe(200);

    const second = await GET(request());
    expect(second.status).toBe(410);
    await expect(second.json()).resolves.toEqual({
      status: "rejected",
      code: "RUNTIME_BOOTSTRAP_CONSUMED",
    });
  });
});
