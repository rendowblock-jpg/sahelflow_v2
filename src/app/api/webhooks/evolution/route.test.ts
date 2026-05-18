import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock modules before importing the route
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/agents/orchestrator", () => ({
  dispatch: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/rate-limit")>(
      "@/lib/rate-limit",
    );
  return {
    ...actual,
    rateLimit: vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: Date.now() + 60000,
      provider: "memory",
    }),
    rateLimitHeaders: vi.fn().mockReturnValue({}),
  };
});

import { createClient } from "@supabase/supabase-js";
import { POST } from "./route";

function createMockSupabase(dataOverrides: Record<string, unknown> = {}) {
  const chain = {
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() =>
      Promise.resolve({ data: dataOverrides.single ?? null, error: null }),
    ),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: dataOverrides.maybeSingle ?? null, error: null }),
    ),
    order: vi.fn(() => chain),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({ subscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(),
  };
  return chain;
}

describe("POST /api/webhooks/evolution", () => {
  // The secret used in all tests that need to pass the authentication check.
  const TEST_SECRET = "test-webhook-secret";
  const AUTH_HEADER = { "x-webhook-secret": TEST_SECRET };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    // Set a valid secret so the fail-close guard passes by default.
    // Individual tests that need to test secret failures override this.
    vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", TEST_SECRET);
    // Default empty Supabase so tests that don't need DB don't crash
    vi.mocked(createClient).mockReturnValue(createMockSupabase() as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 500 when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      body: JSON.stringify({ event: "messages.upsert", instance: "test" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Service unavailable" });
  });

  it("returns 401 for invalid webhook secret", async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", "correct-secret");
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: { "x-webhook-secret": "wrong-secret" },
      body: JSON.stringify({ event: "messages.upsert", instance: "test" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid body (missing required fields)", async () => {
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({ event: "messages.upsert" }), // missing instance
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
    expect(Array.isArray(body.details)).toBe(true);
  });

  it("returns 200 skipped when no matching channel", async () => {
    const mockSupabase = createMockSupabase();
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "nonexistent-instance",
        data: {
          key: {
            remoteJid: "1234567890@s.whatsapp.net",
            fromMe: false,
            id: "msg-1",
          },
          message: { conversation: "Hello" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: true });
  });

  it("returns 200 for connection.update event", async () => {
    const mockSupabase = createMockSupabase({ single: { id: "chan-1" } });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "connection.update",
        instance: "test-instance",
        data: { state: "open" },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 for qrcode.updated event (no-op)", async () => {
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "qrcode.updated",
        instance: "test-instance",
        data: { qrcode: "base64..." },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: true });
  });

  it("skips group messages", async () => {
    const mockSupabase = createMockSupabase({
      single: { id: "chan-1", seller_id: "seller-1" },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@g.us", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello group" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("skips fromMe messages without dispatch", async () => {
    const { dispatch } = await import("@/lib/agents/orchestrator");
    const mockSupabase = createMockSupabase({
      single: { id: "chan-1", seller_id: "seller-1" },
      maybeSingle: { id: "conv-1" },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: {
            remoteJid: "1234567890@s.whatsapp.net",
            fromMe: true,
            id: "msg-1",
          },
          message: { conversation: "Sent from me" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("handles unhandled events gracefully", async () => {
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "some.unknown.event",
        instance: "test-instance",
        data: {},
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: true });
  });

  it("returns 500 on top-level error", async () => {
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });
});
