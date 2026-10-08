import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/runtime/background-start", () => ({
  requestBackgroundStart: vi.fn(),
}));

import { POST } from "@/app/api/internal/runtime-ui-ready/route";
import { RUNTIME_COOKIE } from "@/lib/runtime-auth";

const TOKEN = "a".repeat(64);
const INSTANCE = "b".repeat(32);
let dataDir: string;

function report(): NextRequest {
  return new NextRequest("http://127.0.0.1:4310/api/internal/runtime-ui-ready", {
    method: "POST",
    headers: { cookie: `${RUNTIME_COOKIE}=${TOKEN}`, "X-SahelFlow-UI-Ready": "1" },
  });
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "sf-ui-ready-"));
  vi.stubEnv("SF_RUNTIME_APP_TOKEN", TOKEN);
  vi.stubEnv("SF_RUNTIME_INSTANCE_ID", INSTANCE);
  vi.stubEnv("APP_VERSION", "1.0.0-test");
  vi.stubEnv("SF_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("runtime UI-ready report", () => {
  it("persists ready evidence once and never regresses it on a repeated report", async () => {
    const first = await POST(report());
    expect(first.status).toBe(200);
    const diagnosticPath = join(dataDir, "runtime-ui-diagnostic.json");
    const ackPath = join(dataDir, "runtime-ui-ready.json");
    const diagnostic = JSON.parse(readFileSync(diagnosticPath, "utf8"));
    expect(diagnostic).toMatchObject({ state: "ready", code: "RUNTIME_UI_READY_PERSISTED", instanceId: INSTANCE });
    const before = [statSync(diagnosticPath).mtimeMs, statSync(ackPath).mtimeMs];

    // A retried report (its first response was never seen) leaves the
    // evidence the desktop already acted on untouched.
    const second = await POST(report());
    expect(second.status).toBe(200);
    expect([statSync(diagnosticPath).mtimeMs, statSync(ackPath).mtimeMs]).toEqual(before);
    expect(JSON.parse(readFileSync(diagnosticPath, "utf8"))).toEqual(diagnostic);
  });

  it("persists again once the desktop cleared the evidence for a new navigation", async () => {
    await POST(report());
    rmSync(join(dataDir, "runtime-ui-ready.json"));
    rmSync(join(dataDir, "runtime-ui-diagnostic.json"));
    const again = await POST(report());
    expect(again.status).toBe(200);
    expect(JSON.parse(readFileSync(join(dataDir, "runtime-ui-diagnostic.json"), "utf8"))).toMatchObject({
      state: "ready",
      code: "RUNTIME_UI_READY_PERSISTED",
    });
  });
});
