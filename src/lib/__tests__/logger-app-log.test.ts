import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F-0033: in the installed app, warn and error lines of the structured logger
 * also land in <SF_DATA_DIR>/logs/app.log (sanitized, rate limited). info and
 * debug never do. A broken file sink must never stop the console line or throw.
 */

let dataDir: string;
let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;
let consoleInfo: ReturnType<typeof vi.spyOn>;
let consoleDebug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "sf-logger-app-log-"));
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VITEST", "");
  vi.stubEnv("SF_DATA_DIR", dataDir);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
  consoleDebug = vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("@/lib/log-file");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  rmSync(dataDir, { recursive: true, force: true });
});

async function loadLogger() {
  return (await import("@/lib/logger")).logger;
}

function appLines(): Array<Record<string, unknown>> {
  const file = join(dataDir, "logs", "app.log");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("logger -> app.log", () => {
  it("writes one sanitized line for logger.error and keeps the console line unchanged", async () => {
    const logger = await loadLogger();
    const err = Object.assign(new Error("boom for amine@example.com"), { code: "P2002" });
    logger.error("api.POST /api/x.unexpected", err, {
      orderId: "o1",
      body: "never written",
      phone: "0555123456",
    });

    const lines = appLines();
    expect(lines).toHaveLength(1);
    const line = lines[0] as {
      level: string;
      msg: string;
      context: Record<string, unknown>;
      error: { name: string; code: string; message: string; stack: string };
    };
    expect(line.level).toBe("error");
    expect(line.msg).toBe("api.POST /api/x.unexpected");
    expect(line.context).toEqual({ orderId: "o1", phone: "<digits>" });
    expect(line.error.name).toBe("Error");
    expect(line.error.code).toBe("P2002");
    expect(line.error.message).toBe("boom for <email>");
    expect(line.error.stack.split("\n").length).toBeLessThanOrEqual(6);
    expect(JSON.stringify(lines)).not.toContain("never written");

    // The console keeps getting the same JSON line as before (full, unredacted).
    expect(consoleError).toHaveBeenCalledTimes(1);
    const consoleLine = JSON.parse(String(consoleError.mock.calls[0]?.[0])) as {
      msg: string;
      error: { message: string; stack: string };
    };
    expect(consoleLine.msg).toBe("api.POST /api/x.unexpected");
    expect(consoleLine.error.message).toBe("boom for amine@example.com");
    expect(consoleLine.error.stack).toContain("Error: boom");
  });

  it("writes one line for logger.warn", async () => {
    const logger = await loadLogger();
    logger.warn("api.GET /api/y", { code: "LICENSE_EXPIRED", statusCode: 403 });
    const lines = appLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "warn",
      msg: "api.GET /api/y",
      context: { code: "LICENSE_EXPIRED", statusCode: 403 },
    });
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it("writes nothing for info and debug", async () => {
    vi.stubEnv("SF_LOG_LEVEL", "debug");
    vi.resetModules();
    const logger = await loadLogger();
    logger.info("order.created", { orderId: "o1" });
    logger.debug("cache.hit", { key: "k" });
    expect(consoleInfo).toHaveBeenCalledTimes(1);
    expect(consoleDebug).toHaveBeenCalledTimes(1);
    expect(appLines()).toEqual([]);
    expect(existsSync(join(dataDir, "logs"))).toBe(false);
  });

  it("writes nothing outside production", async () => {
    for (const mode of ["test", "development"]) {
      vi.stubEnv("NODE_ENV", mode);
      vi.resetModules();
      const logger = await loadLogger();
      logger.error("api.mode", new Error("x"));
      logger.warn("api.mode.warn");
    }
    expect(existsSync(join(dataDir, "logs"))).toBe(false);
  });

  it("writes nothing under vitest even in production mode", async () => {
    vi.stubEnv("VITEST", "true");
    const logger = await loadLogger();
    logger.error("api.under.vitest", new Error("x"));
    expect(existsSync(join(dataDir, "logs"))).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("writes nothing and does not throw when SF_DATA_DIR is unset", async () => {
    vi.stubEnv("SF_DATA_DIR", "");
    const logger = await loadLogger();
    expect(() => logger.error("api.no.dir", new Error("x"))).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(existsSync(join(dataDir, "logs"))).toBe(false);
  });

  it("keeps at most 5 lines per msg and tells how many were dropped the next minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T12:00:00.000Z"));
    const logger = await loadLogger();
    for (let i = 0; i < 7; i += 1) logger.error("api.flood", new Error(`e${i}`));
    expect(appLines()).toHaveLength(5);
    expect(consoleError).toHaveBeenCalledTimes(7);

    vi.setSystemTime(new Date("2026-11-03T12:01:01.000Z"));
    logger.error("api.flood", new Error("later"));
    const lines = appLines();
    expect(lines).toHaveLength(7);
    expect(lines[5]).toMatchObject({ msg: "log.suppressed", context: { count: 2 } });
    expect(lines[6]).toMatchObject({ msg: "api.flood", error: { message: "later" } });
  });

  it("still prints the console line and does not throw when the file cannot be created", async () => {
    const blocker = join(dataDir, "blocker");
    writeFileSync(blocker, "a file where the data folder should be");
    vi.stubEnv("SF_DATA_DIR", blocker);
    const logger = await loadLogger();
    expect(() => logger.error("api.broken.disk", new Error("x"))).not.toThrow();
    expect(() => logger.warn("api.broken.disk.warn")).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it("still prints the console line and does not throw when the sink itself throws", async () => {
    vi.doMock("@/lib/log-file", () => ({
      appLogEnabled: () => true,
      appendAppLog: () => {
        throw new Error("disk full");
      },
    }));
    const logger = await loadLogger();
    expect(() => logger.error("api.sink.throws", new Error("x"))).not.toThrow();
    expect(() => logger.warn("api.sink.throws.warn")).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });
});
