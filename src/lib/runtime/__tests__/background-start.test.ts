import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isPackagedDesktopRuntime,
  onBackgroundStartRequested,
  requestBackgroundStart,
} from "../background-start";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("packaged background-worker start gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts the registered workers exactly once, from any caller", () => {
    const start = vi.fn();
    onBackgroundStartRequested(start);
    requestBackgroundStart();
    requestBackgroundStart();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when nothing is registered", () => {
    expect(() => requestBackgroundStart()).not.toThrow();
  });

  it("defers only inside the contained desktop runtime", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SF_RUNTIME_INSTANCE_ID", "a".repeat(32));
    expect(isPackagedDesktopRuntime()).toBe(true);
    vi.stubEnv("SF_RUNTIME_INSTANCE_ID", "");
    expect(isPackagedDesktopRuntime()).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SF_RUNTIME_INSTANCE_ID", "a".repeat(32));
    expect(isPackagedDesktopRuntime()).toBe(false);
  });

  it("keeps worker loading off the readiness path and starts them once the workspace is ready", () => {
    const instrumentation = source("src/instrumentation.ts");
    const uiReady = source("src/app/api/internal/runtime-ui-ready/route.ts");
    const runtimeReady = source("src/app/api/internal/runtime-ready/route.ts");

    expect(instrumentation).toContain("if (isPackagedDesktopRuntime())");
    expect(instrumentation).toContain("onBackgroundStartRequested(startDeferred)");
    expect(instrumentation).toContain("PACKAGED_WORKER_START_FALLBACK_MS");
    expect(instrumentation).toContain("schedulePackagedCompileCacheFlush()");
    expect(uiReady).toContain("requestBackgroundStart();");
    // Readiness must never wait on, or trigger, worker or cache work.
    expect(runtimeReady).not.toContain("requestBackgroundStart");
    expect(runtimeReady).not.toContain("flushPackagedCompileCache");
  });
});
