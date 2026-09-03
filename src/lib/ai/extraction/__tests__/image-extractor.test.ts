import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractWithGeminiFromImage,
  MAX_EXTRACTION_IMAGE_BYTES,
  SAFE_EXTRACTION_IMAGE_TYPES,
} from "../image-extractor";
import type { ExtractionImageInput } from "../types";

const PNG_INPUT: ExtractionImageInput = {
  fileName: "order-screenshot.png",
  mimeType: "image/png",
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]),
};
const OPTIONS = { apiKey: "AIza-test-key-123" };
const COMPLETE = JSON.stringify({
  customerName: "Ahmed",
  phone: "0661234567",
  wilaya: "Alger",
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

describe("extractWithGeminiFromImage (ledger AI-21)", () => {
  it("fails closed without a key and never calls the provider", async () => {
    const result = await extractWithGeminiFromImage(PNG_INPUT, { apiKey: "" });
    expect(result).toMatchObject({ method: "none", order: null });
    expect(result.missingFields).toContain("GEMINI_KEY_MISSING");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported declarations and oversize images before the provider", async () => {
    const wrongType = await extractWithGeminiFromImage(
      { ...PNG_INPUT, mimeType: "image/gif" },
      OPTIONS,
    );
    expect(wrongType.missingFields).toContain("EXTRACTION_IMAGE_TYPE_UNSUPPORTED");
    expect(fetch).not.toHaveBeenCalled();

    const oversize = await extractWithGeminiFromImage(
      { ...PNG_INPUT, bytes: new Uint8Array(MAX_EXTRACTION_IMAGE_BYTES + 1) },
      OPTIONS,
    );
    expect(oversize.missingFields).toContain("EXTRACTION_IMAGE_TOO_LARGE");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the screenshot as inline_data with structured JSON output", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(COMPLETE));
    const result = await extractWithGeminiFromImage(PNG_INPUT, OPTIONS);

    expect(result).toMatchObject({
      method: "gemini",
      confidence: 0.9,
      isComplete: true,
      raw: { model: "gemini-3.5-flash", source: "screenshot" },
    });
    expect(result.order?.phone).toBe("0661234567");

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain(":generateContent");
    const body = JSON.parse(String((init as RequestInit).body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
      generationConfig: { responseMimeType: string };
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    const inline = body.contents[0]!.parts[0]!.inline_data as {
      mime_type: string;
      data: string;
    };
    expect(inline.mime_type).toBe("image/png");
    expect(inline.data.length).toBeGreaterThan(0);
    const prompt = body.contents[0]!.parts[1]!.text as string;
    expect(prompt).toContain("order-screenshot.png");
    expect(prompt).toContain("Return only the JSON");
  });

  it("lists honest missing fields for an incomplete screenshot", async () => {
    vi.mocked(fetch).mockResolvedValue(
      ok(JSON.stringify({ items: [{ productName: "veste", quantity: 2 }] })),
    );
    const result = await extractWithGeminiFromImage(PNG_INPUT, OPTIONS);
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toEqual(
      expect.arrayContaining(["wilaya", "phone"]),
    );
  });

  it("maps provider failures to typed failure codes", async () => {
    vi.mocked(fetch).mockResolvedValue(error(429, "RESOURCE_EXHAUSTED"));
    const result = await extractWithGeminiFromImage(PNG_INPUT, OPTIONS);
    expect(result.order).toBeNull();
    expect(result.method).toBe("none");
    expect(result.missingFields?.[0]).toBeTruthy();
  });

  it("keeps the declared screenshot type set aligned with the inbox image authority", () => {
    expect([...SAFE_EXTRACTION_IMAGE_TYPES].sort()).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});
