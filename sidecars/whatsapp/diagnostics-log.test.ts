import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDiagnosticTeeLogger,
  createDiagnosticsLog,
  scrubDiagnosticText,
} from "./diagnostics-log";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "sf-wa-diag-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function lines(): Array<Record<string, unknown>> {
  return readFileSync(join(directory, "whatsapp-diagnostics.log"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("WhatsApp diagnostics log", () => {
  it("scrubs JIDs and phone-like digit runs from every string", () => {
    expect(scrubDiagnosticText("send to 213555123456@s.whatsapp.net failed")).toBe(
      "send to <jid> failed",
    );
    expect(scrubDiagnosticText("lid 1234567890123@lid")).toBe("lid <jid>");
    expect(scrubDiagnosticText("phone +213 555 12 34 56 rejected")).toBe(
      "phone <digits> rejected",
    );
    expect(scrubDiagnosticText("x".repeat(500))).toHaveLength(160);
  });

  it("writes only allowlisted scalar fields", () => {
    const log = createDiagnosticsLog(directory, () => new Date("2026-10-08T00:00:00Z"));
    log.record("send.outcome", {
      kind: "text",
      code: "WHATSAPP_SEND_NOT_DISPATCHED",
      ms: 42,
      "bad key": "dropped",
      reason: "Not connected 0555123456",
    });
    expect(lines()).toEqual([
      {
        at: "2026-10-08T00:00:00.000Z",
        event: "send.outcome",
        kind: "text",
        code: "WHATSAPP_SEND_NOT_DISPATCHED",
        ms: 42,
        reason: "Not connected <digits>",
      },
    ]);
  });

  it("rotates to a single previous generation", () => {
    const file = join(directory, "whatsapp-diagnostics.log");
    writeFileSync(file, "x".repeat(1024 * 1024));
    const log = createDiagnosticsLog(directory);
    log.record("connection.open");
    expect(statSync(file).size).toBeLessThan(200);
    expect(statSync(`${file}.1`).size).toBe(1024 * 1024);
  });

  it("tees provider warnings without serializing their bound objects", () => {
    const log = createDiagnosticsLog(directory);
    const base = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
    const logger = createDiagnosticTeeLogger(base, log);
    logger.warn({ jid: "213555123456@s.whatsapp.net", node: { secret: 1 } }, "reconnecting");
    logger.info({ jid: "x" }, "not teed");
    const error = Object.assign(new Error("Connection Closed"), { output: { statusCode: 428 } });
    logger.error({ err: error }, "send failed");
    expect(base.warn).toHaveBeenCalledTimes(1);
    const written = readFileSync(join(directory, "whatsapp-diagnostics.log"), "utf8");
    expect(written).not.toContain("213555123456");
    expect(written).not.toContain("secret");
    expect(lines().map((line) => line.event)).toEqual(["provider.warn", "provider.error"]);
    expect(lines()[1]).toMatchObject({ statusCode: 428, errorMessage: "Connection Closed" });
  });
});
