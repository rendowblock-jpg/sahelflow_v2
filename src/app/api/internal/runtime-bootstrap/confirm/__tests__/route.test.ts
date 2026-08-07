import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "../route";

const TOKEN = "f".repeat(64);
const originalRuntimeAppToken = process.env.SF_RUNTIME_APP_TOKEN;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("GET /api/internal/runtime-bootstrap/confirm", () => {
  beforeEach(() => {
    process.env.SF_RUNTIME_APP_TOKEN = TOKEN;
  });

  afterEach(() => {
    restoreEnvironment("SF_RUNTIME_APP_TOKEN", originalRuntimeAppToken);
  });

  it("confirms only a committed HttpOnly runtime session", async () => {
    const missing = await GET(
      new NextRequest(
        "http://127.0.0.1:49152/api/internal/runtime-bootstrap/confirm",
      ),
    );
    const accepted = await GET(
      new NextRequest(
        "http://127.0.0.1:49152/api/internal/runtime-bootstrap/confirm",
        { headers: { cookie: `sf_runtime=${TOKEN}` } },
      ),
    );

    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toEqual({
      status: "rejected",
      code: "RUNTIME_SESSION_REQUIRED",
    });
    expect(accepted.status).toBe(204);
    expect(accepted.headers.get("cache-control")).toBe("no-store");
    expect(accepted.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("remains unavailable outside the loopback runtime", async () => {
    const response = await GET(
      new NextRequest(
        "http://example.com/api/internal/runtime-bootstrap/confirm",
        { headers: { cookie: `sf_runtime=${TOKEN}` } },
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      status: "blocked",
      code: "RUNTIME_BOOTSTRAP_CONFIRM_UNAVAILABLE",
    });
  });
});
