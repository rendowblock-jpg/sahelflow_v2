/**
 * Sentry monitoring tests — T-AUTH-INFRA.
 *
 * Mocks the dynamically-imported `@sentry/next` module + uses vi.resetModules()
 * between describe blocks to control SENTRY_DSN at module-load time.
 *
 * Covers:
 *   - isSentryConfigured() returns false when SENTRY_DSN is unset, true when set
 *   - captureError / setSentryUser are no-ops when SENTRY_DSN is unset
 *   - captureError calls Sentry.captureException (with context) when DSN is set
 *   - setSentryUser calls Sentry.setUser when DSN is set
 *   - Sentry.init is called exactly once (idempotent) on first capture
 *   - beforeEach sets SENTRY_DSN before import (dynamic import + resetModules)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock @sentry/nextjs (the dynamically-imported module name) ─────────────────
const sentryMock = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  init: sentryMock.init,
  captureException: sentryMock.captureException,
  setUser: sentryMock.setUser,
  // default export also surfaced (in case the module imports default)
  default: {
    init: sentryMock.init,
    captureException: sentryMock.captureException,
    setUser: sentryMock.setUser,
  },
}));

// ── SENTRY_DSN unset — no-op path ───────────────────────────────────────────
describe("sentry — SENTRY_DSN unset (no-op)", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("SENTRY_DSN", "");
    sentryMock.init.mockClear();
    sentryMock.captureException.mockClear();
    sentryMock.setUser.mockClear();
  });

  it("isSentryConfigured() returns false", async () => {
    const { isSentryConfigured } = await import("@/lib/monitoring/sentry");
    expect(isSentryConfigured()).toBe(false);
  });

  it("captureError is a no-op — does not call Sentry.init or captureException", async () => {
    const { captureError } = await import("@/lib/monitoring/sentry");
    await captureError(new Error("test"), { context: "x" });
    expect(sentryMock.init).not.toHaveBeenCalled();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("setSentryUser is a no-op", async () => {
    const { setSentryUser } = await import("@/lib/monitoring/sentry");
    await setSentryUser({ id: "u1", email: "a@b.com" });
    expect(sentryMock.setUser).not.toHaveBeenCalled();
  });
});

// ── SENTRY_DSN set — init + capture path ─────────────────────────────────────
describe("sentry — SENTRY_DSN set", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("SENTRY_DSN", "https://abc123@example.com/sentry");
    sentryMock.init.mockClear();
    sentryMock.captureException.mockClear();
    sentryMock.setUser.mockClear();
  });

  it("isSentryConfigured() returns true", async () => {
    const { isSentryConfigured } = await import("@/lib/monitoring/sentry");
    expect(isSentryConfigured()).toBe(true);
  });

  it("captureError calls Sentry.init once + captureException with the error + context", async () => {
    const { captureError } = await import("@/lib/monitoring/sentry");
    const err = new Error("boom");
    await captureError(err, { context: "order.create" });

    expect(sentryMock.init).toHaveBeenCalledTimes(1);
    expect(sentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://abc123@example.com/sentry",
        tracesSampleRate: 0.1,
      }),
    );
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMock.captureException).toHaveBeenCalledWith(err, { context: "order.create" });
  });

  it("Sentry.init is called only once across multiple captureError calls (idempotent)", async () => {
    const { captureError } = await import("@/lib/monitoring/sentry");
    await captureError(new Error("a"));
    await captureError(new Error("b"));
    await captureError(new Error("c"));

    expect(sentryMock.init).toHaveBeenCalledTimes(1);
    expect(sentryMock.captureException).toHaveBeenCalledTimes(3);
  });

  it("setSentryUser calls Sentry.init once + setUser with the user", async () => {
    const { setSentryUser } = await import("@/lib/monitoring/sentry");
    const user = { id: "u1", email: "a@b.com" };
    await setSentryUser(user);

    expect(sentryMock.init).toHaveBeenCalledTimes(1);
    expect(sentryMock.setUser).toHaveBeenCalledWith(user);
  });

  it("beforeSend scrubs PII from request bodies", async () => {
    const { captureError } = await import("@/lib/monitoring/sentry");
    await captureError(new Error("x"));

    const initCall = sentryMock.init.mock.calls[0]![0] as {
      beforeSend: (event: unknown) => unknown;
    };
    expect(typeof initCall.beforeSend).toBe("function");

    // Event with PII in request data → redacted
    const event1 = { request: { data: "{\"password\":\"secret\"}" } };
    const result1 = initCall.beforeSend(event1) as { request: { data: string } };
    expect(result1.request.data).toBe("[REDACTED]");

    // Event without request data → unchanged
    const event2 = { message: "no pii" };
    const result2 = initCall.beforeSend(event2);
    expect(result2).toEqual(event2);
  });
});
