import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, resetRuntimeBootstrapForTest } from "../route";

const TOKEN = "c".repeat(64);

describe("GET /api/internal/runtime-bootstrap", () => {
  beforeEach(() => {
    process.env.SF_RUNTIME_APP_TOKEN = TOKEN;
    resetRuntimeBootstrapForTest();
  });

  afterEach(() => {
    delete process.env.SF_RUNTIME_APP_TOKEN;
    resetRuntimeBootstrapForTest();
  });

  it("rejects a missing or incorrect launch credential", async () => {
    const missing = await GET(new Request("http://127.0.0.1:49152/api/internal/runtime-bootstrap"));
    const wrong = await GET(new Request(`http://127.0.0.1:49152/api/internal/runtime-bootstrap?token=${"d".repeat(64)}`));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  it("sets an HttpOnly launch cookie and consumes the bootstrap", async () => {
    const request = new Request(`http://127.0.0.1:49152/api/internal/runtime-bootstrap?token=${TOKEN}`);
    const accepted = await GET(request);
    const replay = await GET(request);

    expect(accepted.status).toBe(303);
    expect(accepted.headers.get("location")).toBe("http://127.0.0.1:49152/");
    expect(accepted.headers.get("set-cookie")).toContain("sf_runtime=");
    expect(accepted.headers.get("set-cookie")?.toLowerCase()).toContain("httponly");
    expect(accepted.headers.get("set-cookie")?.toLowerCase()).toContain("samesite=strict");
    expect(replay.status).toBe(410);
  });

  it("does not bootstrap on a non-loopback host", async () => {
    const response = await GET(new Request(`http://example.com/api/internal/runtime-bootstrap?token=${TOKEN}`));
    expect(response.status).toBe(404);
  });
});
