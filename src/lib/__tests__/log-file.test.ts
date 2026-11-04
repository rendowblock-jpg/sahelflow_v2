import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appLogEnabled, appendAppLog, createAppLogFile } from "@/lib/log-file";

/**
 * F-0034: the installed app keeps an error history on disk. Mirrors
 * sidecars/whatsapp/diagnostics-log.ts: best effort, bounded, 0o600, and it
 * stops trying after the first I/O failure. It must never throw.
 */

let root: string;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sf-app-log-"));
  for (const key of ["SF_DATA_DIR", "VITEST", "NODE_ENV"]) saved[key] = process.env[key];
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});

function read(file: string): string[] {
  return readFileSync(file, "utf8").trim().split("\n");
}

describe("createAppLogFile", () => {
  it("creates the folder and appends one line per call", () => {
    const directory = join(root, "logs");
    const sink = createAppLogFile(directory);
    sink.append('{"n":1}');
    sink.append('{"n":2}');
    expect(read(join(directory, "app.log"))).toEqual(['{"n":1}', '{"n":2}']);
    expect(sink.disabled).toBe(false);
  });

  it.skipIf(process.platform === "win32")("creates the file readable by its owner only (0o600)", () => {
    const directory = join(root, "logs");
    createAppLogFile(directory).append("{}");
    expect(statSync(join(directory, "app.log")).mode & 0o777).toBe(0o600);
  });

  it("keeps a line with line breaks on one line", () => {
    const directory = join(root, "logs");
    createAppLogFile(directory).append("a\r\nb\nc");
    expect(read(join(directory, "app.log"))).toEqual(["a b c"]);
  });

  it("rotates to app.log.1 at the cap and never holds more than two generations", () => {
    const directory = join(root, "logs");
    const cap = 400;
    const sink = createAppLogFile(directory, { maxBytes: cap });
    for (let i = 0; i < 40; i += 1) {
      sink.append(JSON.stringify({ n: i, pad: "x".repeat(80) }));
    }
    expect(readdirSync(directory).sort()).toEqual(["app.log", "app.log.1"]);
    const current = statSync(join(directory, "app.log")).size;
    const previous = statSync(join(directory, "app.log.1")).size;
    expect(current).toBeLessThanOrEqual(cap);
    expect(previous).toBeLessThanOrEqual(cap);
    expect(current + previous).toBeLessThanOrEqual(2 * cap);
    const newest = read(join(directory, "app.log")).at(-1) ?? "";
    expect(JSON.parse(newest).n).toBe(39);
    // The previous generation is the one right before the current file.
    const lastOfPrevious = JSON.parse(read(join(directory, "app.log.1")).at(-1) ?? "{}").n;
    const firstOfCurrent = JSON.parse(read(join(directory, "app.log"))[0] ?? "{}").n;
    expect(firstOfCurrent).toBe(lastOfPrevious + 1);
  });

  it("defaults to a 1 MiB cap per generation", () => {
    const directory = join(root, "logs");
    const sink = createAppLogFile(directory);
    const line = JSON.stringify({ pad: "y".repeat(1000) });
    for (let i = 0; i < 1200; i += 1) sink.append(line);
    expect(existsSync(join(directory, "app.log.1"))).toBe(true);
    expect(statSync(join(directory, "app.log")).size).toBeLessThanOrEqual(1024 * 1024);
    expect(statSync(join(directory, "app.log.1")).size).toBeLessThanOrEqual(1024 * 1024);
  });

  it("does not throw and stops trying after the first I/O failure", () => {
    const blocker = join(root, "blocker");
    writeFileSync(blocker, "a file where the folder should be");
    const directory = join(blocker, "logs");
    const sink = createAppLogFile(directory);
    expect(() => sink.append("first")).not.toThrow();
    expect(sink.disabled).toBe(true);
    // Remove the obstacle: a disabled sink must still do nothing.
    rmSync(blocker);
    expect(() => sink.append("second")).not.toThrow();
    expect(existsSync(join(blocker, "logs", "app.log"))).toBe(false);
  });

  it("ignores a line that is not a string", () => {
    const directory = join(root, "logs");
    const sink = createAppLogFile(directory);
    expect(() => sink.append(undefined as never)).not.toThrow();
    expect(existsSync(join(directory, "app.log"))).toBe(false);
    expect(sink.disabled).toBe(false);
  });
});

describe("appendAppLog (the process-wide sink)", () => {
  it("writes to <SF_DATA_DIR>/logs/app.log outside tests", () => {
    process.env.SF_DATA_DIR = join(root, "data");
    process.env.VITEST = "";
    expect(appLogEnabled()).toBe(true);
    appendAppLog('{"ok":true}');
    expect(read(join(root, "data", "logs", "app.log"))).toEqual(['{"ok":true}']);
  });

  it("does nothing under vitest, even with SF_DATA_DIR set", () => {
    process.env.SF_DATA_DIR = join(root, "data");
    process.env.VITEST = "true";
    expect(appLogEnabled()).toBe(false);
    appendAppLog('{"ok":true}');
    expect(existsSync(join(root, "data"))).toBe(false);
  });

  it("does nothing without SF_DATA_DIR", () => {
    delete process.env.SF_DATA_DIR;
    process.env.VITEST = "";
    expect(appLogEnabled()).toBe(false);
    expect(() => appendAppLog('{"ok":true}')).not.toThrow();
  });

  it("reports itself disabled after the first I/O failure and never throws", () => {
    const blocker = join(root, "blocker");
    writeFileSync(blocker, "x");
    process.env.SF_DATA_DIR = blocker;
    process.env.VITEST = "";
    expect(appLogEnabled()).toBe(true);
    expect(() => appendAppLog("{}")).not.toThrow();
    expect(appLogEnabled()).toBe(false);
  });
});
