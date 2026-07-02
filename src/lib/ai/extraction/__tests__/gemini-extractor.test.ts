/**
 * Gemini extractor tests — mocks the Gemini REST API via global fetch().
 *
 * gemini-extractor.ts calls fetch() directly (no SDK), so we mock globalThis.fetch.
 * The apiKey is passed via options (no @/lib/secrets dependency here).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  extractWithGemini,
  verifyGeminiKey,
  type GeminiExtractorOptions,
} from "../gemini-extractor";
import type { ExtractionInput } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_INPUT: ExtractionInput = {
  body: "بغيت نشرى iPhone 14 ب 85000 دج، التوصيل ل Alger، رقمي 0661234567",
};

const VALID_OPTIONS: GeminiExtractorOptions = { apiKey: "AIza-test-key-123" };

/** Build a Gemini response with text in candidates[0].content.parts[0].text. */
function geminiOk(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/** Build a Gemini error response. */
function geminiErr(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: { message, status: String(status) } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/** A complete extracted order as JSON (what a good Gemini returns). */
const COMPLETE_ORDER_JSON = JSON.stringify({
  customerName: "Ahmed",
  phone: "0661234567",
  wilaya: "Alger",
  commune: "Bab Ezzouar",
  items: [{ productName: "iPhone 14", quantity: 1, unitPrice: 85000 }],
  totalPrice: 85000,
});

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── extractWithGemini — input validation ─────────────────────────────────────

describe("extractWithGemini — missing API key", () => {
  it("returns a 'none' result when apiKey is empty", async () => {
    const result = await extractWithGemini(DEFAULT_INPUT, { apiKey: "" });

    expect(result.order).toBeNull();
    expect(result.method).toBe("none");
    expect(result.confidence).toBe(0);
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("apiKey");
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ── extractWithGemini — successful extraction ────────────────────────────────

describe("extractWithGemini — successful extraction", () => {
  it("parses a clean JSON response into a complete order", async () => {
    vi.mocked(fetch).mockResolvedValue(geminiOk(COMPLETE_ORDER_JSON));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.method).toBe("gemini");
    expect(result.confidence).toBe(0.9);
    expect(result.isComplete).toBe(true);
    expect(result.order).not.toBeNull();
    expect(result.order?.customerName).toBe("Ahmed");
    expect(result.order?.phone).toBe("0661234567");
    expect(result.order?.wilaya).toBe("Alger");
    expect(result.order?.items).toHaveLength(1);
    expect(result.order?.items[0]?.productName).toBe("iPhone 14");
    expect(result.missingFields).toBeUndefined();
    // Only the first model is tried (it succeeds)
    expect(fetch).toHaveBeenCalledTimes(1);
    // API key sent via header
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "AIza-test-key-123" });
  });

  it("strips markdown code fences around JSON", async () => {
    const fenced = "```json\n" + COMPLETE_ORDER_JSON + "\n```";
    vi.mocked(fetch).mockResolvedValue(geminiOk(fenced));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.order).not.toBeNull();
    expect(result.order?.items).toHaveLength(1);
    expect(result.method).toBe("gemini");
  });

  it("extracts JSON embedded in prose via the fallback regex", async () => {
    const prose = "Voici la commande extraite:\n" + COMPLETE_ORDER_JSON + "\nMerci!";
    vi.mocked(fetch).mockResolvedValue(geminiOk(prose));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.order).not.toBeNull();
    expect(result.order?.wilaya).toBe("Alger");
  });
});

// ── extractWithGemini — incomplete orders ────────────────────────────────────

describe("extractWithGemini — incomplete extraction", () => {
  it("reports missing fields when wilaya and phone are absent", async () => {
    const partial = JSON.stringify({
      customerName: "Ahmed",
      items: [{ productName: "iPhone 14", quantity: 1, unitPrice: 85000 }],
    });
    vi.mocked(fetch).mockResolvedValue(geminiOk(partial));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.order).not.toBeNull();
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("wilaya");
    expect(result.missingFields).toContain("phone");
    expect(result.missingFields).not.toContain("items");
  });

  it("reports missing items when the items array is empty", async () => {
    const noItems = JSON.stringify({
      phone: "0661234567",
      wilaya: "Alger",
      items: [],
    });
    vi.mocked(fetch).mockResolvedValue(geminiOk(noItems));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.order).not.toBeNull();
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("items");
  });
});

// ── extractWithGemini — invalid responses ───────────────────────────────────

describe("extractWithGemini — unparseable responses", () => {
  it("returns all_models_failed when text is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(geminiOk("Désolé, je n'ai pas compris."));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.order).toBeNull();
    expect(result.method).toBe("none");
    // Tried all 3 models (each returns unparseable text → continue)
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.missingFields).toContain("all_models_failed");
  });

  it("returns all_models_failed when JSON lacks the items array", async () => {
    vi.mocked(fetch).mockResolvedValue(geminiOk(JSON.stringify({ customerName: "Ahmed" })));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.order).toBeNull();
    expect(result.method).toBe("none");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns all_models_failed when candidates have no text", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [] } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.order).toBeNull();
    expect(result.missingFields).toContain("all_models_failed");
  });
});

// ── extractWithGemini — HTTP error handling ──────────────────────────────────

describe("extractWithGemini — HTTP errors", () => {
  it("returns rate_limited on a 429 (does not retry next model)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 429 }));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.method).toBe("none");
    expect(result.missingFields).toContain("rate_limited");
    // 429 short-circuits — only 1 fetch
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls through to the next model on 400 (model not available)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(geminiOk(COMPLETE_ORDER_JSON));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.method).toBe("gemini");
    expect(result.order).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls through to the next model on 404", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(geminiOk(COMPLETE_ORDER_JSON));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.method).toBe("gemini");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns the error message on a 500 (all models fail)", async () => {
    vi.mocked(fetch).mockResolvedValue(geminiErr(500, "Server is down"));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.order).toBeNull();
    expect(result.method).toBe("none");
    expect(result.missingFields).toContain("Server is down");
  });

  it("returns all_models_failed when all models return 400/404", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.missingFields).toContain("all_models_failed");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

// ── extractWithGemini — network errors ───────────────────────────────────────

describe("extractWithGemini — network errors", () => {
  it("returns all_models_failed when fetch throws (network down)", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.method).toBe("none");
    expect(result.missingFields).toContain("all_models_failed");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns all_models_failed on timeout (AbortError)", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    vi.mocked(fetch).mockRejectedValue(abortErr);

    const result = await extractWithGemini(DEFAULT_INPUT, VALID_OPTIONS);

    expect(result.missingFields).toContain("all_models_failed");
  });
});

// ── verifyGeminiKey ──────────────────────────────────────────────────────────

describe("verifyGeminiKey — format validation", () => {
  it("rejects a key that does not start with 'AIza'", async () => {
    const result = await verifyGeminiKey("invalid-key-format");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/AIza/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty key", async () => {
    const result = await verifyGeminiKey("");

    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("verifyGeminiKey — valid key", () => {
  it("returns ok:true with the first model that accepts the key", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "x" }] } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await verifyGeminiKey("AIza-valid-key");

    expect(result.ok).toBe(true);
    expect(result.model).toBe("gemini-2.5-flash");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls through models on 400/404 until one works", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "x" }] } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await verifyGeminiKey("AIza-valid-key");

    expect(result.ok).toBe(true);
    expect(result.model).toBe("gemini-1.5-flash");
  });
});

describe("verifyGeminiKey — error responses", () => {
  it("returns a 403 error message", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));

    const result = await verifyGeminiKey("AIza-rejected-key");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/403/);
  });

  it("treats 429 as valid-but-rate-limited", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 429 }));

    const result = await verifyGeminiKey("AIza-rate-limited-key");

    expect(result.ok).toBe(true);
    expect(result.error).toMatch(/quota/i);
  });

  it("returns 'no model available' when all models return 400", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 400 }));

    const result = await verifyGeminiKey("AIza-no-models-key");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Aucun modèle/i);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns a timeout error on AbortError", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    vi.mocked(fetch).mockRejectedValue(abortErr);

    const result = await verifyGeminiKey("AIza-timeout-key");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Délai dépassé/);
  });
});
