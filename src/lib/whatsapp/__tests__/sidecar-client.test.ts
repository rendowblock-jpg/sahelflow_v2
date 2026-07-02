/**
 * WhatsApp sidecar client tests — T-AUTH-INFRA.
 *
 * Mocks global `fetch` + @/lib/env to control SIDECAR_URL + SIDECAR_TOKEN.
 * Verifies each method (status/qr/chats/messages/send/connect/logout/wsToken):
 *   - Calls fetch with the correct URL + Authorization header
 *   - Returns the parsed JSON on success
 *   - Throws Error on non-ok response
 *   - Throws SidecarUnavailableError on connection failure / timeout
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock env with fixed sidecar URL + token ─────────────────────────────────
const { TEST_URL, TEST_TOKEN } = vi.hoisted(() => ({
  TEST_URL: "http://test-sidecar.local",
  TEST_TOKEN: "test-sidecar-token-abcdef-0123456789", // >= 16 chars
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      whatsappSidecarUrl: TEST_URL,
      sidecarToken: TEST_TOKEN,
      sidecarTokenFile: "/nonexistent/sidecar-token-file",
    },
  };
});

import { sidecar, SidecarUnavailableError } from "../sidecar-client";

// ── fetch mock ───────────────────────────────────────────────────────────────
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function errResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

// ── status ───────────────────────────────────────────────────────────────────
describe("sidecar.status", () => {
  it("GETs /status with the bearer token + returns the parsed body", async () => {
    const body = { status: "connected", user: { id: "u1" }, hasQr: false };
    fetchMock.mockResolvedValue(okResponse(body));

    const result = await sidecar.status();
    expect(result).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${TEST_URL}/status`);
    expect((init as RequestInit).method).toBeUndefined(); // default GET
    expect((init as RequestInit).headers).toEqual({
      Authorization: `Bearer ${TEST_TOKEN}`,
    });
  });

  it("throws Error with the server message on non-ok response", async () => {
    fetchMock.mockResolvedValue(errResponse(500, { error: "sidecar exploded" }));
    await expect(sidecar.status()).rejects.toThrow("sidecar exploded");
  });

  it("falls back to 'Sidecar HTTP <status>' when no error/message in body", async () => {
    fetchMock.mockResolvedValue(errResponse(503, {}));
    await expect(sidecar.status()).rejects.toThrow("Sidecar HTTP 503");
  });
});

// ── qr ───────────────────────────────────────────────────────────────────────
describe("sidecar.qr", () => {
  it("GETs /qr + returns { qr }", async () => {
    fetchMock.mockResolvedValue(okResponse({ qr: "qr-string-123" }));
    const result = await sidecar.qr();
    expect(result).toEqual({ qr: "qr-string-123" });
    expect(fetchMock.mock.calls[0]![0]).toBe(`${TEST_URL}/qr`);
  });

  it("returns { qr: null } when the sidecar is unreachable (SidecarUnavailableError)", async () => {
    // Simulate connection refused — fetch rejects with TypeError
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const result = await sidecar.qr();
    expect(result).toEqual({ qr: null });
  });

  it("re-throws non-sidecar errors (e.g. HTTP 500)", async () => {
    fetchMock.mockResolvedValue(errResponse(500, { error: "boom" }));
    await expect(sidecar.qr()).rejects.toThrow("boom");
  });
});

// ── chats ────────────────────────────────────────────────────────────────────
describe("sidecar.chats", () => {
  it("GETs /chats?limit=N with the default limit=50", async () => {
    fetchMock.mockResolvedValue(okResponse({ chats: [] }));
    await sidecar.chats();
    expect(fetchMock.mock.calls[0]![0]).toBe(`${TEST_URL}/chats?limit=50`);
  });

  it("accepts a custom limit", async () => {
    fetchMock.mockResolvedValue(okResponse({ chats: [] }));
    await sidecar.chats(10);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${TEST_URL}/chats?limit=10`);
  });

  it("returns the chats array", async () => {
    const chats = [{ jid: "1@s.whatsapp.net", name: "A", unread: 0 }];
    fetchMock.mockResolvedValue(okResponse({ chats }));
    const result = await sidecar.chats();
    expect(result.chats).toEqual(chats);
  });
});

// ── messages ─────────────────────────────────────────────────────────────────
describe("sidecar.messages", () => {
  it("GETs /chats/<jid>/messages?limit=N with URL-encoded jid", async () => {
    fetchMock.mockResolvedValue(okResponse({ jid: "1@s.whatsapp.net", messages: [] }));
    await sidecar.messages("1@s.whatsapp.net", 50);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${TEST_URL}/chats/1%40s.whatsapp.net/messages?limit=50`,
    );
  });

  it("uses default limit=100", async () => {
    fetchMock.mockResolvedValue(okResponse({ jid: "x", messages: [] }));
    await sidecar.messages("x@s.whatsapp.net");
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${TEST_URL}/chats/x%40s.whatsapp.net/messages?limit=100`,
    );
  });

  it("returns the jid + messages", async () => {
    const messages = [
      {
        key: { remoteJid: "1@s.whatsapp.net", fromMe: false, id: "m1" },
        message: { conversation: "hi" },
        messageTimestamp: 1700000000,
      },
    ];
    fetchMock.mockResolvedValue(okResponse({ jid: "1@s.whatsapp.net", messages }));
    const result = await sidecar.messages("1@s.whatsapp.net");
    expect(result.messages).toEqual(messages);
  });
});

// ── send ─────────────────────────────────────────────────────────────────────
describe("sidecar.send", () => {
  it("POSTs /send with the to+text body + Content-Type header", async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true, id: "msg-1", status: "sent" }));
    const result = await sidecar.send("213555000111", "Hello");
    expect(result).toEqual({ ok: true, id: "msg-1", status: "sent" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${TEST_URL}/send`);
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect((init as RequestInit).body).toBe(JSON.stringify({ to: "213555000111", text: "Hello" }));
  });
});

// ── connect ──────────────────────────────────────────────────────────────────
describe("sidecar.connect", () => {
  it("POSTs /connect + returns the merged status", async () => {
    const body = { ok: true, status: "connecting", user: null, hasQr: true };
    fetchMock.mockResolvedValue(okResponse(body));
    const result = await sidecar.connect();
    expect(result).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${TEST_URL}/connect`);
    expect((init as RequestInit).method).toBe("POST");
  });
});

// ── logout ───────────────────────────────────────────────────────────────────
describe("sidecar.logout", () => {
  it("DELETEs /logout + returns ok+message", async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true, message: "logged out" }));
    const result = await sidecar.logout();
    expect(result).toEqual({ ok: true, message: "logged out" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${TEST_URL}/logout`);
    expect((init as RequestInit).method).toBe("DELETE");
  });
});

// ── wsToken ──────────────────────────────────────────────────────────────────
describe("sidecar.wsToken", () => {
  it("returns the resolved sidecar token", () => {
    expect(sidecar.wsToken()).toBe(TEST_TOKEN);
  });
});

// ── error handling: connection refused + timeout ─────────────────────────────
describe("connection failures → SidecarUnavailableError", () => {
  it("throws SidecarUnavailableError on TypeError (fetch failed / ECONNREFUSED)", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED"));
    await expect(sidecar.status()).rejects.toBeInstanceOf(SidecarUnavailableError);
    await expect(sidecar.status()).rejects.toThrow(/not reachable/i);
  });

  it("throws SidecarUnavailableError when error message matches /fetch failed|ECONNREFUSED/i", async () => {
    const err = new Error("fetch failed: connect ECONNREFUSED 127.0.0.1:3001");
    fetchMock.mockRejectedValue(err);
    await expect(sidecar.chats()).rejects.toBeInstanceOf(SidecarUnavailableError);
  });

  it("re-throws unknown errors unchanged", async () => {
    const err = new Error("some other error");
    fetchMock.mockRejectedValue(err);
    await expect(sidecar.chats()).rejects.toThrow("some other error");
  });
});

// ── authorization header always present ──────────────────────────────────────
describe("Authorization header", () => {
  it("is attached on every method call", async () => {
    fetchMock.mockResolvedValue(okResponse({}));

    await sidecar.status();
    await sidecar.chats();
    await sidecar.messages("jid@s.whatsapp.net");
    await sidecar.send("to", "text");
    await sidecar.connect();
    await sidecar.logout();

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.headers).toHaveProperty("Authorization", `Bearer ${TEST_TOKEN}`);
    }
  });
});
