import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ flush: vi.fn() }));

vi.mock("@/lib/runtime/compile-cache", () => ({
  flushPackagedCompileCache: mocks.flush,
}));

import { POST } from "../route";

const TOKEN = "a".repeat(64);
const INSTANCE_ID = "b".repeat(32);
let root = "";

function request(token = TOKEN, instanceId = INSTANCE_ID) {
  return new NextRequest(
    "http://127.0.0.1:49152/api/internal/runtime-shutdown",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-sahelflow-runtime-instance": instanceId,
      },
    },
  );
}

describe("POST /api/internal/runtime-shutdown", () => {
  beforeEach(() => {
    root = mkdtempSync(resolve(tmpdir(), "sahelflow-shutdown-"));
    const cache = resolve(root, "cache");
    mkdirSync(cache, { recursive: true });
    writeFileSync(resolve(cache, "module-cache.bin"), "compiled-module");
    process.env.SF_DATA_DIR = root;
    process.env.NODE_COMPILE_CACHE = cache;
    process.env.SF_RUNTIME_TOKEN = TOKEN;
    process.env.SF_RUNTIME_INSTANCE_ID = INSTANCE_ID;
    process.env.APP_VERSION = "4.1.0-test";
    mocks.flush.mockReset();
    mocks.flush.mockReturnValue(true);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.SF_DATA_DIR;
    delete process.env.NODE_COMPILE_CACHE;
    delete process.env.SF_RUNTIME_TOKEN;
    delete process.env.SF_RUNTIME_INSTANCE_ID;
    delete process.env.APP_VERSION;
  });

  it("flushes and durably receipts the exact runtime instance", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.flush).toHaveBeenCalledOnce();
    const diagnostic = JSON.parse(
      readFileSync(resolve(root, "runtime-shutdown-diagnostic.json"), "utf8"),
    );
    expect(diagnostic).toMatchObject({
      state: "flushed",
      code: "RUNTIME_COMPILE_CACHE_FLUSHED",
      instanceId: INSTANCE_ID,
      appVersion: "4.1.0-test",
      cacheFileCount: 1,
      cacheBytes: 15,
    });
  });

  it("rejects a mismatched authority before flushing", async () => {
    const response = await POST(request("c".repeat(64)));

    expect(response.status).toBe(503);
    expect(mocks.flush).not.toHaveBeenCalled();
  });

  it("fails closed when flush or durable cache evidence is unavailable", async () => {
    mocks.flush.mockReturnValueOnce(false);
    const failedFlush = await POST(request());
    expect(failedFlush.status).toBe(500);

    rmSync(process.env.NODE_COMPILE_CACHE as string, {
      recursive: true,
      force: true,
    });
    const emptyCache = await POST(request());
    expect(emptyCache.status).toBe(500);
    await expect(emptyCache.json()).resolves.toMatchObject({
      code: "RUNTIME_COMPILE_CACHE_EMPTY",
    });
  });
});
