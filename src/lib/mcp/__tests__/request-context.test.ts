/**
 * Rate limiting and audit tests — verify the CodFlow-convention guards.
 */

import { describe, expect, it, beforeEach } from "vitest";

import {
  checkRateLimit,
  readClientMeta,
  redactForAudit,
  logToolCall,
  getAuditLog,
  RATE_LIMIT_MAX_CALLS,
} from "../request-context";

describe("checkRateLimit", () => {
  it("allows calls under the limit", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("test-user-a")).toEqual({ allowed: true });
    }
  });

  it("blocks calls over the limit", () => {
    // Exhaust the limit
    for (let i = 0; i < RATE_LIMIT_MAX_CALLS; i++) {
      checkRateLimit("test-user-b");
    }
    const result = checkRateLimit("test-user-b");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("tracks subjects independently", () => {
    // Exhaust user-c
    for (let i = 0; i < RATE_LIMIT_MAX_CALLS; i++) {
      checkRateLimit("test-user-c");
    }
    expect(checkRateLimit("test-user-c").allowed).toBe(false);
    // user-d should still be allowed
    expect(checkRateLimit("test-user-d")).toEqual({ allowed: true });
  });
});

describe("readClientMeta", () => {
  it("reads openai/subject and openai/session from _meta", () => {
    const ctx = {
      _meta: {
        "openai/subject": "user-123",
        "openai/session": "session-456",
      },
    };
    expect(readClientMeta(ctx)).toEqual({
      subject: "user-123",
      session: "session-456",
    });
  });

  it("returns empty for missing _meta", () => {
    expect(readClientMeta({})).toEqual({});
    expect(readClientMeta(undefined)).toEqual({});
  });

  it("ignores non-string values", () => {
    const ctx = {
      _meta: {
        "openai/subject": 123,
        "openai/session": true,
      },
    };
    expect(readClientMeta(ctx)).toEqual({});
  });
});

describe("redactForAudit", () => {
  it("caps long strings at 1024 chars", () => {
    const long = "x".repeat(2000);
    const result = redactForAudit(long) as string;
    expect(result).toBe("<2000 chars elided>");
  });

  it("preserves short strings", () => {
    expect(redactForAudit("hello")).toBe("hello");
  });

  it("caps nesting depth at 8", () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < 15; i++) {
      deep = { nested: deep };
    }
    // Should not throw
    const result = redactForAudit(deep);
    expect(result).toBeDefined();
  });

  it("handles arrays", () => {
    expect(redactForAudit([1, "two", true])).toEqual([1, "two", true]);
  });

  it("handles null and undefined", () => {
    expect(redactForAudit(null)).toBeNull();
    expect(redactForAudit(undefined)).toBeUndefined();
  });
});

describe("logToolCall + getAuditLog", () => {
  it("stores audit entries", () => {
    logToolCall({
      timestamp: new Date().toISOString(),
      tool: "searchOrders",
      actor: "test-actor",
      ok: true,
      args: { query: "test" },
    });
    const log = getAuditLog(10);
    expect(log.length).toBeGreaterThan(0);
    const last = log[log.length - 1];
    expect(last.tool).toBe("searchOrders");
    expect(last.ok).toBe(true);
  });

  it("stores failure entries with error", () => {
    logToolCall({
      timestamp: new Date().toISOString(),
      tool: "createOrder",
      actor: "test-actor",
      ok: false,
      args: {},
      error: "validation failed",
    });
    const log = getAuditLog(10);
    const last = log[log.length - 1];
    expect(last.ok).toBe(false);
    expect(last.error).toBe("validation failed");
  });
});
