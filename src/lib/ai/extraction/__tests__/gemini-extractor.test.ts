import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractWithGemini,
  verifyGeminiKey,
  type GeminiExtractorOptions,
} from "../gemini-extractor";
import type { ExtractionInput } from "../types";

const INPUT: ExtractionInput = {
  body: "بغيت نشرى iPhone 14 ب 85000 دج، التوصيل ل Alger، رقمي 0661234567",
};
const OPTIONS: GeminiExtractorOptions = { apiKey: "AIza-test-key-123" };
const COMPLETE = JSON.stringify({
  customerName: "Ahmed",
  phone: "0661234567",
  wilaya: "Alger",
  commune: "Bab Ezzouar",
  items: [{ productName: "iPhone 14", quantity: 1, unitPrice: 85000 }],
  totalPrice: 85000,
});

function ok(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
function error(status: number, providerStatus: string): Response {
  return new Response(
    JSON.stringify({ error: { status: providerStatus, message: providerStatus } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("extractWithGemini", () => {
  it("does not call the provider without a key", async () => {
    const result = await extractWithGemini(INPUT, { apiKey: "" });
    expect(result).toMatchObject({ method: "none", order: null });
    expect(result.missingFields).toContain("GEMINI_KEY_MISSING");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses structured JSON output on the preferred stable model", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(COMPLETE));
    const result = await extractWithGemini(INPUT, OPTIONS);

    expect(result).toMatchObject({
      method: "gemini",
      confidence: 0.9,
      isComplete: true,
      raw: { model: "gemini-3.5-flash" },
    });
    expect(result.order?.phone).toBe("0661234567");
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain("gemini-3.5-flash:generateContent");
    const body = JSON.parse(String((init as RequestInit).body)) as {
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig).toHaveProperty("responseFormat");
    expect(body.generationConfig).not.toHaveProperty("temperature");
  });

  it("reports incomplete but valid extraction fields", async () => {
    vi.mocked(fetch).mockResolvedValue(
      ok(JSON.stringify({ items: [{ productName: "Phone", quantity: 1 }] })),
    );
    const result = await extractWithGemini(INPUT, OPTIONS);
    expect(result.order).not.toBeNull();
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toEqual(expect.arrayContaining(["wilaya", "phone"]));
  });

  it("rejects non-JSON model output", async () => {
    vi.mocked(fetch).mockResolvedValue(ok("not json"));
    const result = await extractWithGemini(INPUT, OPTIONS);
    expect(result.order).toBeNull();
    expect(result.missingFields).toContain("GEMINI_INVALID_EXTRACTION");
  });

  it("falls forward from a retired/unavailable preferred model", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(error(404, "NOT_FOUND"))
      .mockResolvedValueOnce(ok(COMPLETE));
    const result = await extractWithGemini(INPUT, OPTIONS);
    expect(result.raw).toEqual({ model: "gemini-3.6-flash" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses stable quota failure codes instead of provider prose", async () => {
    vi.mocked(fetch).mockResolvedValue(error(429, "RESOURCE_EXHAUSTED"));
    const result = await extractWithGemini(INPUT, OPTIONS);
    expect(result.order).toBeNull();
    expect(result.missingFields).toContain("GEMINI_QUOTA_EXHAUSTED");
  });
});

describe("verifyGeminiKey", () => {
  it("rejects invalid key format before network activity", async () => {
    const result = await verifyGeminiKey("invalid-format");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GEMINI_KEY_INVALID");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires real model output and reports the selected stable model", async () => {
    vi.mocked(fetch).mockResolvedValue(ok("OK"));
    const result = await verifyGeminiKey("AIza-valid-key");
    expect(result).toMatchObject({ ok: true, model: "gemini-3.5-flash" });
  });

  it("falls forward on model retirement", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(error(404, "NOT_FOUND"))
      .mockResolvedValueOnce(ok("OK"));
    const result = await verifyGeminiKey("AIza-valid-key");
    expect(result).toMatchObject({ ok: true, model: "gemini-3.6-flash" });
  });

  it("never treats quota exhaustion as key verification", async () => {
    vi.mocked(fetch).mockResolvedValue(error(429, "RESOURCE_EXHAUSTED"));
    const result = await verifyGeminiKey("AIza-rate-limited-key");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GEMINI_QUOTA_EXHAUSTED");
  });

  it("returns stable permission failures", async () => {
    vi.mocked(fetch).mockResolvedValue(error(403, "PERMISSION_DENIED"));
    const result = await verifyGeminiKey("AIza-rejected-key");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GEMINI_PERMISSION_DENIED");
  });

  it("requires non-empty output even after HTTP success", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(""));
    const result = await verifyGeminiKey("AIza-valid-key");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GEMINI_PROVIDER_UNAVAILABLE");
  });
});
