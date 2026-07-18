import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const TOKEN = "e".repeat(64);

describe("runtime proxy boundary", () => {
  beforeEach(() => {
    process.env.SF_RUNTIME_APP_TOKEN = TOKEN;
    delete process.env.AUTH_SECRET;
  });

  afterEach(() => {
    delete process.env.SF_RUNTIME_APP_TOKEN;
    delete process.env.AUTH_SECRET;
  });

  it("rejects requests without the per-launch cookie before setup mode", async () => {
    const response = await proxy(new NextRequest("http://127.0.0.1:49152/setup"));
    expect(response.status).toBe(401);
  });

  it("allows a matching per-launch cookie to continue", async () => {
    const response = await proxy(new NextRequest("http://127.0.0.1:49152/setup", {
      headers: { cookie: `sf_runtime=${TOKEN}` },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("leaves browser development unchanged when no runtime token exists", async () => {
    delete process.env.SF_RUNTIME_APP_TOKEN;
    const response = await proxy(new NextRequest("http://localhost:3000/setup"));
    expect(response.status).toBe(200);
  });
});
