import { beforeEach, describe, expect, it, vi } from "vitest";

const { TEST_TOKEN, TEST_URL } = vi.hoisted(() => ({
  TEST_TOKEN: "test-sidecar-token-abcdef-0123456789",
  TEST_URL: "http://test-sidecar.local",
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      whatsappSidecarUrl: TEST_URL,
      sidecarToken: TEST_TOKEN,
      sidecarTokenFile: "/nonexistent/token-file",
    },
  };
});

import { verifySidecarWebSocketGrant } from "../../../../sidecars/whatsapp/auth-tokens";
import {
  sidecar,
  SidecarRequestError,
  SidecarUnavailableError,
} from "../sidecar-client";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const REQUEST_BINDING = "ab".repeat(32);
const EFFECT_KEY = `wa:${"11".repeat(16)}:${"22".repeat(32)}:text:id`;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("WhatsApp sidecar client", () => {
  it("uses the private REST token for server-to-sidecar requests", async () => {
    fetchMock.mockResolvedValue(response(200, { status: "connected" }));
    await sidecar.status();
    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_URL}/status`,
      expect.objectContaining({
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      }),
    );
    expect(sidecar.restToken()).toBe(TEST_TOKEN);
  });

  it("issues a short-lived signed grant with an explicit renewal boundary", () => {
    const subject = "authenticated-owner:test-session";
    const bundle = sidecar.wsGrantBundle(subject);
    expect(bundle?.token).toBeTruthy();
    expect(bundle?.token).not.toBe(TEST_TOKEN);
    expect(bundle?.expiresAt).toBeGreaterThan(Date.now());
    expect(verifySidecarWebSocketGrant(bundle!.token, TEST_TOKEN)).toMatchObject({
      subject,
      expiresAt: bundle!.expiresAt,
    });
  });

  it("sends a request-bound durable effect", async () => {
    fetchMock.mockResolvedValue(
      response(200, { ok: true, id: "WA-1", status: "sent" }),
    );
    await expect(
      sidecar.send("213555000111", "Hello", EFFECT_KEY, REQUEST_BINDING),
    ).resolves.toEqual({ ok: true, id: "WA-1", status: "sent" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(
      JSON.stringify({
        to: "213555000111",
        text: "Hello",
        effectKey: EFFECT_KEY,
        requestBinding: REQUEST_BINDING,
      }),
    );
  });

  it("reads a durable receipt without invoking another provider send", async () => {
    fetchMock.mockResolvedValue(
      response(200, { receipt: { id: "WA-1", status: "sent" } }),
    );
    await expect(
      sidecar.receipt(EFFECT_KEY, REQUEST_BINDING),
    ).resolves.toEqual({ ok: true, id: "WA-1", status: "sent" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${TEST_URL}/send-receipt`);
    expect(init.method).toBe("POST");
  });

  it("returns null when the receipt journal confirms no receipt", async () => {
    fetchMock.mockResolvedValue(response(200, { receipt: null }));
    await expect(sidecar.receipt(EFFECT_KEY, REQUEST_BINDING)).resolves.toBeNull();
  });

  it("preserves retryability and ambiguity returned by the sidecar", async () => {
    fetchMock.mockResolvedValue(
      response(503, {
        error: "not connected",
        code: "WHATSAPP_NOT_CONNECTED",
        retryable: true,
        ambiguous: false,
      }),
    );
    const error = await sidecar
      .send("213555000111", "Hello", EFFECT_KEY, REQUEST_BINDING)
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(SidecarRequestError);
    expect(error).toMatchObject({
      code: "WHATSAPP_NOT_CONNECTED",
      retryable: true,
      ambiguous: false,
      status: 503,
    });
  });

  it("classifies connection refusal as safely retryable before submit", async () => {
    const error = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    fetchMock.mockRejectedValue(error);
    const caught = await sidecar.status().catch((failure) => failure);
    expect(caught).toBeInstanceOf(SidecarUnavailableError);
    expect(caught).toMatchObject({ ambiguous: false });
  });

  it("classifies timeout as ambiguous because a send may have committed", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    );
    const pending = sidecar.status().catch((failure) => failure);
    await vi.advanceTimersByTimeAsync(8_000);
    const caught = await pending;
    expect(caught).toBeInstanceOf(SidecarUnavailableError);
    expect(caught).toMatchObject({ ambiguous: true });
    vi.useRealTimers();
  });
});
