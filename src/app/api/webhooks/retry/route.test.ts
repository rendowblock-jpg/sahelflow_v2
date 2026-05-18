import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/webhooks/retry auth guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const req = new Request("http://localhost/api/webhooks/retry", { method: "POST" });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ error: "Service unavailable" });
  });

  it("rejects invalid secret", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");

    const req = new Request("http://localhost/api/webhooks/retry", {
      method: "POST",
      headers: {
        "x-cron-secret": "wrong-secret",
      },
    });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });
});
