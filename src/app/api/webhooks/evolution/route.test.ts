import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoist mock functions so they can be referenced inside vi.mock calls
const { mockRateLimit, mockDispatch } = vi.hoisted(() => {
  return {
    mockRateLimit: vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: Date.now() + 60000,
      provider: "memory",
    }),
    mockDispatch: vi.fn().mockResolvedValue({ success: true }),
  };
});

// Mock modules before importing the route
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/agents/orchestrator", () => ({
  dispatch: mockDispatch,
}));

vi.mock("@/lib/rate-limit", async () => {
  return {
    rateLimit: mockRateLimit,
    rateLimitHeaders: vi.fn().mockReturnValue({ "X-RateLimit-Limit": "60" }),
  };
});

import { createClient } from "@supabase/supabase-js";
import { POST } from "./route";

// Helper to mock Supabase calls dynamically based on table names
function createMockSupabase(responses: Record<string, {
  single?: any;
  maybeSingle?: any;
  then?: any;
}> = {}) {
  let currentTable = "";
  const chain: any = {
    from: vi.fn((table) => {
      currentTable = table;
      return chain;
    }),
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => {
      const tableResp = responses[currentTable];
      let resp = tableResp?.single;
      if (Array.isArray(resp)) {
        resp = resp.shift();
      }
      if (resp && typeof resp === "object" && ("data" in resp || "error" in resp)) {
        return Promise.resolve(resp);
      }
      return Promise.resolve({ data: resp ?? null, error: null });
    }),
    maybeSingle: vi.fn(() => {
      const tableResp = responses[currentTable];
      let resp = tableResp?.maybeSingle;
      if (Array.isArray(resp)) {
        resp = resp.shift();
      }
      if (resp && typeof resp === "object" && ("data" in resp || "error" in resp)) {
        return Promise.resolve(resp);
      }
      return Promise.resolve({ data: resp ?? null, error: null });
    }),
    then: vi.fn((resolve, reject) => {
      const tableResp = responses[currentTable];
      let resp = tableResp?.then;
      if (Array.isArray(resp)) {
        resp = resp.shift();
      }
      if (resp instanceof Error) {
        if (reject) reject(resp);
        return Promise.reject(resp);
      }
      // Support throwing non-Error values by using a special object wrapper
      if (resp && typeof resp === "object" && resp.__isRejected) {
        if (reject) reject(resp.value);
        return Promise.reject(resp.value);
      }
      if (resp && typeof resp === "object" && ("data" in resp || "error" in resp)) {
        if (resolve) resolve(resp);
        return Promise.resolve(resp);
      }
      const val = { data: resp ?? null, error: null };
      if (resolve) resolve(val);
      return Promise.resolve(val);
    }),
  };
  return chain;
}

describe("POST /api/webhooks/evolution", () => {
  const TEST_SECRET = "test-webhook-secret";
  const AUTH_HEADER = { "x-webhook-secret": TEST_SECRET };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock-url.supabase.co");
    vi.mocked(createClient).mockReturnValue(createMockSupabase() as never);
    
    // Reset our hoisted mocks to default values
    mockRateLimit.mockReset().mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: Date.now() + 60000,
      provider: "memory",
    });
    mockDispatch.mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /* ── 1. Authentication & Config Guards ── */

  it("returns 500 when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    // S5 fix: auth check now happens before SUPABASE_SERVICE_ROLE_KEY check,
    // so the request must include the correct webhook secret to pass auth.
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({ event: "messages.upsert", instance: "test" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Service unavailable" });
  });

  it("returns 503 when EVOLUTION_WEBHOOK_SECRET is not configured", async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", "");
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({ event: "messages.upsert", instance: "test" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service unavailable" });
  });

  it("returns 401 for invalid webhook secret (x-webhook-secret)", async () => {
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

  it("returns 401 for invalid webhook secret (x-hub-signature)", async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", "correct-secret");
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: { "x-hub-signature": "wrong-secret" },
      body: JSON.stringify({ event: "messages.upsert", instance: "test" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 when both webhook secret headers are missing", async () => {
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: {}, // no auth headers
      body: JSON.stringify({ event: "messages.upsert", instance: "test" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("authenticates successfully using x-hub-signature", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: { "x-hub-signature": TEST_SECRET },
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
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

  /* ── 2. Rate Limiting ── */

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
      provider: "memory",
    });

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests" });
  });

  /* ── 3. Event Routing & skip paths ── */

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
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: true });
  });

  it("returns 200 for connection.update event (connected)", async () => {
    const mockSupabase = createMockSupabase({
      channels: {
        single: [
          { id: "chan-1" }, // first query in POST
          { credentials: { original_key: "val" } } // second query in handleConnectionUpdate
        ],
        then: {},
      },
    });
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

  it("returns 200 for connection.update event (disconnected / no state fallback)", async () => {
    const mockSupabase = createMockSupabase({
      channels: {
        single: [
          { id: "chan-1" }, // first call in POST
          null // second call in handleConnectionUpdate (causes channelData to be null)
        ],
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "connection.update",
        instance: "test-instance",
        data: { state: "close" },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("returns 200 for connection.update event (missing state)", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1" } },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "connection.update",
        instance: "test-instance",
        data: {}, // state is missing
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("returns 200 for qrcode.updated event (no-op)", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1" } },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

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
    expect(await res.json()).toEqual({ ok: true });
  });

  it("skips group messages", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
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
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null, // not duplicate
        then: {},
      },
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
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("handles unhandled events gracefully", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1" } },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

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
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 500 on top-level error", async () => {
    // S5 fix: auth check now happens before body parsing.
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: "not-json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });

  it("returns 500 on top-level error (non-Error exception)", async () => {
    // S5 fix: auth check now happens before body parsing.
    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: "not-json",
    });
    req.json = vi.fn().mockRejectedValue("Some non-Error string rejection");

    const res = await POST(req as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });

  /* ── 4. Message Extraction Formats ── */

  it("handles messages when data is an array of messages", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: [
          {
            key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
            message: { conversation: "Hello array" },
          },
        ],
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("handles messages when data.messages is an array", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          messages: [
            {
              key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
              message: { conversation: "Hello messages array" },
            },
          ],
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("handles messages when data message has a key", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          message: {
            key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
            message: { conversation: "Hello inner message" },
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("skips message when key is missing", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          message: { conversation: "No key here" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("skips message when remoteJid is missing", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { fromMe: false, id: "msg-1" },
          message: { conversation: "No remoteJid" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("skips message when message body is missing", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  /* ── 5. Message Content Types Parsing ── */

  it("parses extendedTextMessage content", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: {
            extendedTextMessage: { text: "Extended text message content" },
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("parses imageMessage with url and caption", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: {
            imageMessage: { url: "http://whatsapp.image", caption: "Photo caption" },
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("parses imageMessage without url and caption (uses fallbacks)", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: {
            imageMessage: {},
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("parses audioMessage", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: {
            audioMessage: {},
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("parses videoMessage with url and caption", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: {
            videoMessage: { url: "http://whatsapp.video", caption: "Video caption" },
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("parses videoMessage without caption", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: {
            videoMessage: { url: "http://whatsapp.video" }, // no caption
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("parses documentMessage with fileName", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: {
            documentMessage: { fileName: "invoice.pdf" },
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("parses documentMessage without fileName", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: {
            documentMessage: {}, // no fileName
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("skips message with unknown format content", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: {
            unknownMessageBodyFormat: {},
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  /* ── 6. Conversation & Customer creation flows ── */

  it("conversation exists: uses existing conversation id and does not upsert customer", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          pushName: "John Doe",
          message: { conversation: "Hello" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    // verify we did not call upsert on customers
    expect(mockSupabase.from).not.toHaveBeenCalledWith("customers");
  });

  it("conversation does not exist: upserts customer and creates new conversation", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          null, // first check: conversation does not exist
          { id: "conv-1" } // unread count query
        ]
      },
      customers: {
        single: { id: "cust-1" }
      },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          pushName: "John Doe",
          message: { conversation: "Hello" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith("customers");
    expect(mockSupabase.from).toHaveBeenCalledWith("conversations");
  });

  it("conversation does not exist: creates new conversation when fromMe is true", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          null, // first check: conversation does not exist
          { id: "conv-1" } // unread count query
        ]
      },
      customers: {
        single: { id: "cust-1" }
      },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: true, id: "msg-1" },
          pushName: "John Doe",
          message: { conversation: "Hello from me new convo" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("conversation does not exist: customer upsert fails with error but conversation is still created", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          null, // first check
          { id: "conv-1" } // unread count query
        ]
      },
      customers: {
        // Return an error on customer single
        single: { data: null, error: { message: "DB Error" } }
      },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("conversation does not exist: concurrent insert race, queries existing conversation", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          null, // first check
          null, // insert returns null (concurrent write race)
          { id: "conv-raced" }, // query fallback works
          { id: "conv-raced" } // unread count query
        ]
      },
      customers: {
        single: { id: "cust-1" }
      },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("conversation does not exist: concurrent insert race, and fallback query also fails (continues loop)", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          null, // first check
          null, // insert returns null
          null // query fallback also fails
        ]
      },
      customers: {
        single: { id: "cust-1" }
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  /* ── 7. Deduplication ── */

  it("skips duplicate message when messageId already exists in DB", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: { single: { id: "conv-1" } },
      messages: {
        single: { id: "existing-msg-id" }, // duplicate found
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello duplicated message" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    // verify insert was not called on messages
    expect(mockSupabase.insert).not.toHaveBeenCalled();
  });

  /* ── 8. Orchestrator Dispatch & Retry Queueing ── */

  it("inbound message: updates unread count and dispatches to orchestrator", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          { id: "conv-1" }, // existing convo check
          { unread_count: 5 } // unread count query
        ],
        then: {},
      },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello orchestrator" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockDispatch).toHaveBeenCalledWith({
      type: "message.received",
      conversationId: "conv-1",
      sellerId: "seller-1",
    });
  });

  it("inbound message: unread count falls back to 0 if convo query returns null", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          { id: "conv-1" }, // existing convo check
          null // unread count query returns null
        ],
        then: {},
      },
      messages: {
        single: null,
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello null convo details" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("inbound message: dispatch fails, inserts to webhook_retry_queue", async () => {
    mockDispatch.mockRejectedValueOnce(new Error("Dispatch service is offline"));

    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          { id: "conv-1" },
          { unread_count: 2 }
        ],
        then: {},
      },
      messages: {
        single: null,
        then: {},
      },
      webhook_retry_queue: {
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello offline queue" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith("webhook_retry_queue");
  });

  it("inbound message: dispatch fails, retry queue insert fails (generic Error)", async () => {
    mockDispatch.mockRejectedValueOnce(new Error("Dispatch offline"));

    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          { id: "conv-1" },
          { unread_count: 2 }
        ],
        then: {},
      },
      messages: {
        single: null,
        then: {},
      },
      webhook_retry_queue: {
        then: new Error("DB Connection Error on retry queue insert"),
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello offline database queue error" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("inbound message: dispatch fails, retry queue insert fails (duplicate/unique error - ignored)", async () => {
    mockDispatch.mockRejectedValueOnce(new Error("Dispatch offline"));

    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          { id: "conv-1" },
          { unread_count: 2 }
        ],
        then: {},
      },
      messages: {
        single: null,
        then: {},
      },
      webhook_retry_queue: {
        then: new Error("duplicate key value violates unique constraint"),
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello unique constraint violation on retry" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("inbound message: dispatch fails, retry queue insert fails (non-Error object is ignored/logged)", async () => {
    mockDispatch.mockRejectedValueOnce(new Error("Dispatch offline"));

    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          { id: "conv-1" },
          { unread_count: 2 }
        ],
        then: {},
      },
      messages: {
        single: null,
        then: {},
      },
      webhook_retry_queue: {
        // wrap a non-Error value in our special reject wrapper
        then: { __isRejected: true, value: { code: "SOME_CODE", details: "Non-error failure" } },
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello non-Error object rejection" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("inbound message: dispatch fails with non-Error value, handles retry queueing", async () => {
    mockDispatch.mockRejectedValueOnce("Some string dispatch error");

    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          { id: "conv-1" },
          { unread_count: 2 }
        ],
        then: {},
      },
      messages: {
        single: null,
        then: {},
      },
      webhook_retry_queue: {
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false, id: "msg-1" },
          message: { conversation: "Hello dispatch non-Error failure" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("inbound message: dispatch fails, handles fallback generating unique idempotency key when messageId is missing", async () => {
    mockDispatch.mockRejectedValueOnce(new Error("Dispatch offline"));

    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1", seller_id: "seller-1" } },
      conversations: {
        single: [
          { id: "conv-1" },
          { unread_count: 0 }
        ],
        then: {},
      },
      messages: {
        single: null,
        then: {},
      },
      webhook_retry_queue: {
        then: {},
      },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

    const req = new Request("http://localhost/api/webhooks/evolution", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "test-instance",
        data: {
          key: { remoteJid: "1234567890@s.whatsapp.net", fromMe: false }, // NO id
          message: { conversation: "Hello offline no msgId" },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith("webhook_retry_queue");
  });

  it("handles unhandled events gracefully when channel is found", async () => {
    const mockSupabase = createMockSupabase({
      channels: { single: { id: "chan-1" } },
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);

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
    expect(await res.json()).toEqual({ ok: true });
  });
});
