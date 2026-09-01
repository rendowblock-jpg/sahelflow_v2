import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyTransportCause,
  describeTransportCause,
  verifyGeminiKey,
  type GeminiTransportCause,
} from "../provider";

const AQ_KEY = `AQ.${"a".repeat(50)}`; // 53-char new-format AI Studio key

function textResponse(
  body: unknown,
  init?: { status?: number; contentType?: string },
): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": init?.contentType ?? "application/json" },
  });
}

function fetchError(
  message: string,
  cause?: { name?: string; code?: string },
): TypeError {
  const error = new TypeError(message);
  if (cause) {
    (error as TypeError & { cause: unknown }).cause = Object.assign(
      new Error(cause.code ?? cause.name ?? "cause"),
      { code: cause.code, name: cause.name },
    );
  }
  return error;
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("verifyGeminiKey probe truthfulness (campaign D1 round 3)", () => {
  it("verifies a key when Google answers 200 with visible text", async () => {
    vi.mocked(fetch).mockResolvedValue(
      textResponse({
        candidates: [
          {
            content: { parts: [{ text: "OK" }] },
            finishReason: "STOP",
          },
        ],
      }),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    expect(result.ok).toBe(true);
    expect(result.model).toBe("gemini-3.5-flash");
  });

  it("verifies the demonstrated Internal.32 failure: 200 + finishReason MAX_TOKENS with no visible text (thinking-budget response)", async () => {
    // Google returned 200; the thinking model spent the whole visible output
    // budget on internal thought. The key authenticated and the model
    // generated — the probe must convert this, not call the provider
    // unavailable (the installed campaign's exact HTTP n/a signature).
    vi.mocked(fetch).mockResolvedValue(
      textResponse({
        candidates: [{ finishReason: "MAX_TOKENS" }],
      }),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    expect(result.ok).toBe(true);
    expect(result.model).toBe("gemini-3.5-flash");
  });

  it("reports GEMINI_REQUEST_INVALID with blockReason when the 200 body carries promptFeedback.blockReason and no candidates", async () => {
    vi.mocked(fetch).mockResolvedValue(
      textResponse({ promptFeedback: { blockReason: "SAFETY" } }),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GEMINI_REQUEST_INVALID");
    expect(result.diagnostics?.responseShape).toMatchObject({
      jsonParseFailed: false,
      candidatesCount: 0,
      blockReason: "SAFETY",
    });
  });

  it("names a non-JSON 200 body (captive portal / intercepting middlebox) via jsonParseFailed", async () => {
    vi.mocked(fetch).mockResolvedValue(
      textResponse("<html>captive portal</html>", {
        contentType: "text/html",
      }),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GEMINI_PROVIDER_UNAVAILABLE");
    expect(result.diagnostics?.responseShape).toMatchObject({
      jsonParseFailed: true,
      candidatesCount: null,
    });
  });

  it("carries the named transport cause when fetch fails without an HTTP response", async () => {
    vi.mocked(fetch).mockRejectedValue(
      fetchError("fetch failed", {
        name: "ConnectTimeoutError",
        code: "UND_ERR_CONNECT_TIMEOUT",
      }),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GEMINI_NETWORK_ERROR");
    expect(result.diagnostics?.httpStatus).toBeUndefined();
    expect(result.diagnostics?.transport).toMatchObject({
      code: "UND_ERR_CONNECT_TIMEOUT",
    });
    expect(result.diagnostics?.transportClass).toBe("blocked");
  });

  it("maps a DNS transport cause to the dns family", async () => {
    vi.mocked(fetch).mockRejectedValue(
      fetchError("fetch failed", {
        name: "Error",
        code: "ENOTFOUND",
      }),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    expect(result.diagnostics?.transportClass).toBe("dns");
  });

  it("maps a TLS interception transport cause to the tls family", async () => {
    vi.mocked(fetch).mockRejectedValue(
      fetchError("fetch failed", {
        name: "Error",
        code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      }),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    expect(result.diagnostics?.transportClass).toBe("tls");
  });

  it("maps a connection-reset transport cause to the reset family", async () => {
    vi.mocked(fetch).mockRejectedValue(
      fetchError("fetch failed", { name: "Error", code: "ECONNRESET" }),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    expect(result.diagnostics?.transportClass).toBe("reset");
  });

  it("never carries key material in probe diagnostics", async () => {
    vi.mocked(fetch).mockRejectedValue(
      fetchError(`fetch failed for ${AQ_KEY}`, {
        name: "Error",
        code: "ECONNRESET",
      }),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    const serialized = JSON.stringify(result.diagnostics);
    expect(serialized).not.toContain(AQ_KEY);
    expect(serialized).toContain("[redacted]");
  });

  it("keeps HTTP-error diagnostics intact (status + provider status, no transport)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      textResponse(
        { error: { code: 401, status: "UNAUTHENTICATED", message: "API key not valid" } },
        { status: 401 },
      ),
    );
    const result = await verifyGeminiKey(AQ_KEY);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GEMINI_KEY_INVALID");
    expect(result.diagnostics?.httpStatus).toBe(401);
    expect(result.diagnostics?.providerStatus).toBe("UNAUTHENTICATED");
    expect(result.diagnostics?.transport ?? null).toBeNull();
  });

  it("sends a usable generation budget so thinking models can answer in text", async () => {
    vi.mocked(fetch).mockResolvedValue(
      textResponse({
        candidates: [{ content: { parts: [{ text: "OK" }] }, finishReason: "STOP" }],
      }),
    );
    await verifyGeminiKey(AQ_KEY);
    const call = vi.mocked(fetch).mock.calls[0];
    const init = call?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body)) as {
      generationConfig: { maxOutputTokens: number };
    };
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(128);
  });
});

describe("transport cause classification", () => {
  it("classifies and preserves codes PII-free", () => {
    const cause: GeminiTransportCause = {
      name: "ConnectTimeoutError",
      code: "UND_ERR_CONNECT_TIMEOUT",
    };
    expect(classifyTransportCause(cause)).toBe("blocked");
    expect(describeTransportCause(fetchError("fetch failed", cause))).toEqual(
      cause,
    );
  });

  it("returns null classifications for unknown causes instead of guessing", () => {
    expect(classifyTransportCause({ name: "Error", code: "SOMETHING_NEW" })).toBe(
      null,
    );
    expect(classifyTransportCause(null)).toBe(null);
  });

  it("falls back to the top-level error identity when no cause chain exists", () => {
    const plain = new Error("boom");
    expect(describeTransportCause(plain)).toEqual({ name: "Error", code: null });
    expect(describeTransportCause("not an error")).toBe(null);
  });
});
