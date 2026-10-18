/**
 * Gemini API-key carriage and leak resistance (audit AIX-09 / S06a-10).
 *
 * Legacy-format keys travel in the documented `x-goog-api-key` header so they
 * never appear in a URL. New-format "AQ." keys keep the `?key=` parameter: the
 * installed Internal.32 campaign (row D1, round 3) proved the header carriage
 * rejected a valid AQ. key, so switching them would break a working install.
 * For BOTH families no thrown error, log line or probe result may contain the
 * key or a URL that carries it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

import {
  GeminiProviderError,
  requestGemini,
  verifyGeminiKey,
} from "@/lib/ai/gemini/provider";

// Built at runtime so the literals never look like real credentials to a
// secret scanner. Neither value is a real key.
const LEGACY_KEY = ["AI", "za", "SyFakeFakeFakeFakeFakeFake12345678"].join("");
const NEW_FORMAT_KEY = ["AQ", ".", "Ab8RN6FakeFakeFakeFakeFake_90"].join("");

const fetchSpy = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function allLogOutput(): string {
  return JSON.stringify(
    Object.values(loggerMock).flatMap((fn) => fn.mock.calls),
  );
}

beforeEach(() => {
  fetchSpy.mockReset();
  for (const fn of Object.values(loggerMock)) fn.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Gemini auth carriage", () => {
  it("sends a legacy-format key in the x-goog-api-key header and keeps it out of the URL (plain call)", async () => {
    fetchSpy.mockImplementation(async () => jsonResponse({ candidates: [] }));
    await requestGemini(LEGACY_KEY, { body: {}, maxAttemptsPerModel: 1 });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).not.toContain(LEGACY_KEY);
    expect(String(url)).not.toMatch(/[?&]key=/);
    expect(String(url)).toContain(":generateContent");
    expect((init as RequestInit).headers).toMatchObject({
      "x-goog-api-key": LEGACY_KEY,
      "Content-Type": "application/json",
    });
  });

  it("sends a legacy-format key in the header for the streaming call too", async () => {
    fetchSpy.mockImplementation(async () => jsonResponse({}));
    await requestGemini(LEGACY_KEY, {
      body: {},
      stream: true,
      maxAttemptsPerModel: 1,
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain(":streamGenerateContent?alt=sse");
    expect(String(url)).not.toContain(LEGACY_KEY);
    expect(String(url)).not.toMatch(/[?&]key=/);
    expect((init as RequestInit).headers).toMatchObject({
      "x-goog-api-key": LEGACY_KEY,
    });
  });

  it("trims a whitespace-padded stored key before it travels", async () => {
    fetchSpy.mockImplementation(async () => jsonResponse({}));
    await requestGemini(`  ${LEGACY_KEY}\n`, {
      body: {},
      maxAttemptsPerModel: 1,
    });

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(LEGACY_KEY);
  });

  it("keeps the ?key= carriage for AQ. keys (installed evidence: header was rejected)", async () => {
    fetchSpy.mockImplementation(async () => jsonResponse({}));
    await requestGemini(NEW_FORMAT_KEY, {
      body: {},
      stream: true,
      maxAttemptsPerModel: 1,
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain(
      `alt=sse&key=${encodeURIComponent(NEW_FORMAT_KEY)}`,
    );
    expect(
      (init as RequestInit).headers as Record<string, string>,
    ).not.toHaveProperty("x-goog-api-key");
  });
});

describe.each([
  ["legacy-format", LEGACY_KEY],
  ["new-format AQ.", NEW_FORMAT_KEY],
])("secret hygiene for a %s key", (_label, key) => {
  it("scrubs the key from a transport error that quotes the request URL", async () => {
    fetchSpy.mockImplementation(async () => {
      throw new TypeError(
        `Failed to parse URL from https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key=${encodeURIComponent(key)} (key ${key})`,
      );
    });

    const error = await requestGemini(key, {
      body: {},
      maxAttemptsPerModel: 1,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GeminiProviderError);
    const thrown = error as GeminiProviderError;
    const surfaced = JSON.stringify({
      message: thrown.message,
      stack: thrown.stack,
      transport: thrown.transport,
    });
    expect(surfaced).not.toContain(key);
    expect(surfaced).not.toContain(encodeURIComponent(key));
    expect(allLogOutput()).not.toContain(key);
  });

  it("scrubs the key from an upstream error body that echoes it", async () => {
    fetchSpy.mockImplementation(async () =>
      jsonResponse(
        {
          error: {
            code: 400,
            message: `API key not valid (${key}). Please pass a valid API key.`,
            status: "INVALID_ARGUMENT",
          },
        },
        400,
      ),
    );

    const error = await requestGemini(key, {
      body: {},
      maxAttemptsPerModel: 1,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GeminiProviderError);
    const thrown = error as GeminiProviderError;
    expect(thrown.message).not.toContain(key);
    // The classification still works: it keys off the words, not the secret.
    expect(thrown.code).toBe("GEMINI_KEY_INVALID");
    expect(allLogOutput()).not.toContain(key);
  });

  it("never puts the key into the key-verification result", async () => {
    fetchSpy.mockImplementation(async () => {
      throw new TypeError(
        `fetch failed for https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key=${encodeURIComponent(key)}`,
      );
    });

    const result = await verifyGeminiKey(key, 1_000);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain(encodeURIComponent(key));
    expect(allLogOutput()).not.toContain(key);
  });
});
