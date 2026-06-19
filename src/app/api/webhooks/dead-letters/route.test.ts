import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

describe("/api/webhooks/dead-letters admin guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("GET fails closed when no admin secret is configured", async () => {
    vi.stubEnv("ADMIN_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");

    const req = new Request("http://localhost/api/webhooks/dead-letters");
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ error: "Service unavailable" });
  });

  it("GET rejects invalid secret", async () => {
    vi.stubEnv("ADMIN_SECRET", "admin-secret");

    const req = new Request("http://localhost/api/webhooks/dead-letters", {
      headers: {
        "x-admin-secret": "wrong-secret",
      },
    });
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("POST validates missing action/id before DB calls", async () => {
    vi.stubEnv("ADMIN_SECRET", "admin-secret");

    const req = new Request("http://localhost/api/webhooks/dead-letters", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-secret": "admin-secret",
      },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    // M4 fix: now uses zod validation, returns "Invalid request" + details
    expect(body.error).toBe("Invalid request");
    expect(Array.isArray(body.details)).toBe(true);
  });
});
