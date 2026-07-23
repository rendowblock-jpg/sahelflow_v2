import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/internal/runtime-ui-ready/route";

const token = "a".repeat(64);
const instanceId = "b".repeat(32);
let dataDir = "";

function request(withCookie: boolean): NextRequest {
  return new NextRequest("http://127.0.0.1:43123/api/internal/runtime-ui-ready", {
    method: "POST",
    headers: withCookie ? { cookie: `sf_runtime=${token}` } : undefined,
  });
}

describe("packaged runtime hydrated UI readiness", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "sahelflow-ui-ready-"));
    process.env.SF_RUNTIME_APP_TOKEN = token;
    process.env.SF_RUNTIME_INSTANCE_ID = instanceId;
    process.env.APP_VERSION = "1.0.0-internal.5";
    process.env.SF_DATA_DIR = dataDir;
  });

  afterEach(() => {
    delete process.env.SF_RUNTIME_APP_TOKEN;
    delete process.env.SF_RUNTIME_INSTANCE_ID;
    delete process.env.APP_VERSION;
    delete process.env.SF_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("persists a current-instance acknowledgment only with the native runtime cookie", async () => {
    const response = await POST(request(true));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready", instanceId });

    const acknowledgment = JSON.parse(
      readFileSync(join(dataDir, "runtime-ui-ready.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(acknowledgment.formatVersion).toBe(1);
    expect(acknowledgment.protocolVersion).toBe(1);
    expect(acknowledgment.state).toBe("ready");
    expect(acknowledgment.instanceId).toBe(instanceId);
    expect(acknowledgment.appVersion).toBe("1.0.0-internal.5");
    expect(acknowledgment.pageUrl).toMatch(
      /^http:\/\/(127\.0\.0\.1|localhost):43123$/,
    );
    expect(typeof acknowledgment.processId).toBe("number");
    expect(typeof acknowledgment.createdAtUnixSeconds).toBe("number");
  });

  it("fails closed without the WebView runtime cookie", async () => {
    const response = await POST(request(false));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "rejected",
      code: "RUNTIME_SESSION_REQUIRED",
    });
    expect(() => readFileSync(join(dataDir, "runtime-ui-ready.json"))).toThrow();
  });
});
