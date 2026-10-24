import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/runtime/background-start", () => ({
  requestBackgroundStart: vi.fn(),
}));

import { POST } from "@/app/api/internal/runtime-ui-ready/route";
import { RUNTIME_COOKIE } from "@/lib/runtime-auth";
import { LAUNCH_APPEARANCE_FILE } from "@/lib/runtime/launch-appearance";

const TOKEN = "a".repeat(64);
const INSTANCE = "b".repeat(32);
let dataDir: string;

function report(extraCookies: string[] = []): NextRequest {
  return new NextRequest("http://127.0.0.1:4310/api/internal/runtime-ui-ready", {
    method: "POST",
    headers: {
      cookie: [`${RUNTIME_COOKIE}=${TOKEN}`, ...extraCookies].join("; "),
      "X-SahelFlow-UI-Ready": "1",
    },
  });
}

function reportWithBody(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://127.0.0.1:4310/api/internal/runtime-ui-ready", {
    method: "POST",
    headers: {
      cookie: `${RUNTIME_COOKIE}=${TOKEN}`,
      "X-SahelFlow-UI-Ready": "1",
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });
}

const TIMING = {
  responseStartMs: 812,
  responseEndMs: 9034,
  domContentLoadedEventEndMs: 15_101,
  loadEventEndMs: 26_001,
  firstContentfulPaintMs: 14_000,
  beaconMs: 27_124,
  scriptCount: 41,
  scriptTransferBytes: 1_530_000,
  scriptDecodedBytes: 6_500_000,
  resourceCount: 120,
};

function diagnostic(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dataDir, "runtime-ui-diagnostic.json"), "utf8"));
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

  it("records how the workspace looks, for the next native startup card", async () => {
    const response = await POST(
      report(["sahelflow-locale=ar", "sahelflow-theme=system", "sahelflow-theme-preset=oasis"]),
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(readFileSync(join(dataDir, LAUNCH_APPEARANCE_FILE), "utf8"))).toMatchObject({
      formatVersion: 1,
      locale: "ar",
      theme: "system",
      preset: "oasis",
    });
  });

  it("keeps the appearance record when the desktop clears the ready evidence", async () => {
    await POST(report(["sahelflow-theme=light", "sahelflow-theme-preset=dune"]));
    // The desktop removes the receipt at the start of every launch; the card
    // of a launch that crashes must still match what the seller last saw.
    rmSync(join(dataDir, "runtime-ui-ready.json"));
    rmSync(join(dataDir, "runtime-ui-diagnostic.json"));
    expect(existsSync(join(dataDir, LAUNCH_APPEARANCE_FILE))).toBe(true);
    expect(JSON.parse(readFileSync(join(dataDir, LAUNCH_APPEARANCE_FILE), "utf8"))).toMatchObject({
      theme: "light",
      preset: "dune",
    });
  });

  it("never fails readiness because the appearance record could not be written", async () => {
    mkdirSync(join(dataDir, LAUNCH_APPEARANCE_FILE));
    const response = await POST(report(["sahelflow-theme=dark"]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready", instanceId: INSTANCE });
    expect(JSON.parse(readFileSync(join(dataDir, "runtime-ui-ready.json"), "utf8"))).toMatchObject({
      state: "ready",
    });
  });

  it("writes nothing for an unauthenticated report", async () => {
    const request = new NextRequest("http://127.0.0.1:4310/api/internal/runtime-ui-ready", {
      method: "POST",
      headers: { cookie: "sahelflow-theme=light" },
    });
    expect((await POST(request)).status).toBe(401);
    expect(existsSync(join(dataDir, LAUNCH_APPEARANCE_FILE))).toBe(false);
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
  describe("page timings sent with the report", () => {
    it("stores them in the ready diagnostic record, next to the existing fields", async () => {
      const response = await POST(reportWithBody(JSON.stringify({ timing: TIMING })));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ready", instanceId: INSTANCE });
      const record = diagnostic();
      expect(record).toMatchObject({
        formatVersion: 1,
        state: "ready",
        code: "RUNTIME_UI_READY_PERSISTED",
        instanceId: INSTANCE,
        appVersion: "1.0.0-test",
        uiTiming: TIMING,
      });
      // The same files as without timings; no second record is written.
      expect(readdirSync(dataDir).sort()).toEqual([
        LAUNCH_APPEARANCE_FILE,
        "runtime-ui-diagnostic.json",
        "runtime-ui-ready.json",
      ]);
    });

    it("keeps the record exactly as before when the report carries no timing", async () => {
      expect((await POST(report())).status).toBe(200);
      expect("uiTiming" in diagnostic()).toBe(false);
      expect((await POST(reportWithBody("{}"))).status).toBe(200);
      expect("uiTiming" in diagnostic()).toBe(false);
    });

    it("stores clamped whole numbers, drops a value that is not a finite number, and nothing else", async () => {
      const response = await POST(
        reportWithBody(
          JSON.stringify({ timing: { responseStartMs: 1e15, beaconMs: 500.6, loadEventEndMs: "soon", scriptCount: -2 } }),
        ),
      );
      expect(response.status).toBe(200);
      expect(diagnostic().uiTiming).toEqual({ responseStartMs: 600_000, beaconMs: 501, scriptCount: 0 });
    });

    it.each([
      ["not JSON", "this is not json"],
      ["an empty body", ""],
      ["a list", "[1,2]"],
      ["a timing that is a string", JSON.stringify({ timing: "fast" })],
      ["a timing with an unknown key", JSON.stringify({ timing: { beaconMs: 5, url: "http://127.0.0.1/secret" } })],
      ["an unknown key beside the timing", JSON.stringify({ timing: { beaconMs: 5 }, extra: 1 })],
      ["a timing without any usable number", JSON.stringify({ timing: { beaconMs: "x" } })],
    ])("still reports ready, and stores no timing, for %s", async (_label, body) => {
      const response = await POST(reportWithBody(body));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ready", instanceId: INSTANCE });
      expect(diagnostic()).toMatchObject({ state: "ready", code: "RUNTIME_UI_READY_PERSISTED" });
      expect("uiTiming" in diagnostic()).toBe(false);
      expect(JSON.parse(readFileSync(join(dataDir, "runtime-ui-ready.json"), "utf8"))).toMatchObject({ state: "ready" });
    });

    it("ignores a body that is too large, however it is declared", async () => {
      const big = JSON.stringify({ timing: { beaconMs: 5 }, pad: "x".repeat(10_000) });
      expect((await POST(reportWithBody(big))).status).toBe(200);
      expect("uiTiming" in diagnostic()).toBe(false);
      rmSync(join(dataDir, "runtime-ui-ready.json"));
      rmSync(join(dataDir, "runtime-ui-diagnostic.json"));
      const lying = JSON.stringify({ timing: { beaconMs: 5 } });
      expect((await POST(reportWithBody(lying, { "content-length": "999999" }))).status).toBe(200);
      expect("uiTiming" in diagnostic()).toBe(false);
    });

    it("still reports ready when the body cannot be read", async () => {
      const broken = new ReadableStream({
        start(controller) {
          controller.error(new Error("connection closed"));
        },
      });
      const request = new NextRequest("http://127.0.0.1:4310/api/internal/runtime-ui-ready", {
        method: "POST",
        headers: { cookie: `${RUNTIME_COOKIE}=${TOKEN}`, "X-SahelFlow-UI-Ready": "1", "Content-Type": "application/json" },
        body: broken,
        duplex: "half",
      } as ConstructorParameters<typeof NextRequest>[1]);
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect("uiTiming" in diagnostic()).toBe(false);
    });

    it("keeps the first timing: a repeated report changes no file", async () => {
      await POST(reportWithBody(JSON.stringify({ timing: TIMING })));
      const diagnosticPath = join(dataDir, "runtime-ui-diagnostic.json");
      const before = [statSync(diagnosticPath).mtimeMs, readFileSync(diagnosticPath, "utf8")];
      const again = await POST(reportWithBody(JSON.stringify({ timing: { ...TIMING, beaconMs: 1 } })));
      expect(again.status).toBe(200);
      expect([statSync(diagnosticPath).mtimeMs, readFileSync(diagnosticPath, "utf8")]).toEqual(before);
    });

    it("writes nothing for an unauthenticated report that carries timings", async () => {
      const request = new NextRequest("http://127.0.0.1:4310/api/internal/runtime-ui-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timing: TIMING }),
      });
      expect((await POST(request)).status).toBe(401);
      expect(readdirSync(dataDir)).toEqual(["runtime-ui-diagnostic.json"]);
      expect("uiTiming" in diagnostic()).toBe(false);
    });
  });
});
