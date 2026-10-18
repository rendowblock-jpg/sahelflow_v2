/**
 * S01b-10: logAudit stays best-effort (an audit table that is locked must not
 * fail a backup or a restore) but a swallowed failure must leave a structured,
 * secret-free signal: an action label, a failure code and a running count.
 * Never the error message, the entry payload, identifiers or actors.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
}));

import type { ServiceContext } from "@/lib/data/service-base";
import {
  getAuditWriteFailureCount,
  logAudit,
  resetAuditWriteFailureCountForTests,
} from "../audit";

const MARKER = "sf-test-marker-0f9e8d7c";

function contextWith(create: () => Promise<unknown>): ServiceContext {
  return { prisma: { auditLog: { create } } } as unknown as ServiceContext;
}

function busyError(): Error {
  return Object.assign(new Error(`database is locked ${MARKER}`), {
    code: "SQLITE_BUSY",
  });
}

const failing = () =>
  contextWith(async () => {
    throw busyError();
  });

describe("logAudit swallowed failures (S01b-10)", () => {
  beforeEach(() => {
    warn.mockClear();
    resetAuditWriteFailureCountForTests();
  });

  it("still never throws when the audit insert fails", async () => {
    await expect(
      logAudit(failing(), { action: "backup.create" }),
    ).resolves.toBeUndefined();
  });

  it("emits one structured line with the action, the failure code and the count", async () => {
    await logAudit(failing(), { action: "backup.restore.staged" });
    expect(warn).toHaveBeenCalledTimes(1);
    const [message, fields] = warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe("audit.write_failed");
    expect(fields).toEqual({
      action: "backup.restore.staged",
      code: "SQLITE_BUSY",
      failures: 1,
    });
  });

  it("never logs the error message, the payload, identifiers or the actor", async () => {
    await logAudit(failing(), {
      action: "privacy.erase",
      entity: "customer",
      entityId: `cust-${MARKER}`,
      actor: `actor-${MARKER}`,
      before: { note: MARKER },
      after: { note: MARKER },
      metadata: { note: MARKER },
      ip: "203.0.113.9",
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(MARKER);
    expect(logged).not.toContain("203.0.113.9");
  });

  it("falls back to the error name, then to UNKNOWN, and rejects unsafe codes", async () => {
    const named = Object.assign(new Error(MARKER), { name: "TimeoutError" });
    await logAudit(
      contextWith(async () => {
        throw named;
      }),
      { action: "a.one" },
    );
    await logAudit(
      contextWith(async () => {
        throw "not an error object";
      }),
      { action: "a.two" },
    );
    await logAudit(
      contextWith(async () => {
        throw Object.assign(new Error("x"), { code: `bad code ${MARKER}`, name: "" });
      }),
      { action: "a.three" },
    );
    const codes = warn.mock.calls.map((call) => (call[1] as { code: string }).code);
    expect(codes).toEqual(["TimeoutError", "UNKNOWN", "UNKNOWN"]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(MARKER);
  });

  it("counts every failure but throttles the log lines", async () => {
    for (let index = 0; index < 12; index += 1) {
      await logAudit(failing(), { action: "backup.create" });
    }
    expect(getAuditWriteFailureCount()).toBe(12);
    expect(warn).toHaveBeenCalledTimes(5);
    const counts = warn.mock.calls.map((call) => (call[1] as { failures: number }).failures);
    expect(counts).toEqual([1, 2, 3, 4, 5]);
  });

  it("logs again at every fiftieth failure so a long outage stays visible", async () => {
    for (let index = 0; index < 50; index += 1) {
      await logAudit(failing(), { action: "backup.create" });
    }
    const counts = warn.mock.calls.map((call) => (call[1] as { failures: number }).failures);
    expect(counts).toEqual([1, 2, 3, 4, 5, 50]);
  });

  it("replaces an unexpected action label instead of logging it", async () => {
    await logAudit(failing(), { action: `has spaces ${MARKER}` });
    expect((warn.mock.calls[0]?.[1] as { action: string }).action).toBe("invalid");
    expect(JSON.stringify(warn.mock.calls)).not.toContain(MARKER);
  });

  it("is silent when the insert succeeds", async () => {
    await logAudit(
      contextWith(async () => ({ id: "1" })),
      { action: "backup.create" },
    );
    expect(warn).not.toHaveBeenCalled();
    expect(getAuditWriteFailureCount()).toBe(0);
  });
});
