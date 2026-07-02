/**
 * Smart router tests — regex-vs-Gemini routing logic.
 *
 * The router imports @/lib/db (only used by recordExtractionMetric) and
 * ./gemini-extractor (calls fetch). We mock both so tests are isolated:
 *   - @/lib/db               → vi.fn for extractionMetric.create
 *   - ./gemini-extractor     → vi.fn for extractWithGemini (returns our canned result)
 *   - ./regex-extractor      → NOT mocked (pure function, runs for real)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    extractionMetric: {
      create: vi.fn().mockResolvedValue({ id: "metric-1" }),
    },
  },
}));

vi.mock("../gemini-extractor", () => ({
  extractWithGemini: vi.fn(),
  verifyGeminiKey: vi.fn(),
}));

import { extractOrder, recordExtractionMetric } from "../smart-router";
import { extractWithGemini } from "../gemini-extractor";
import { db } from "@/lib/db";
import type { ExtractionResult } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A complete, high-confidence regex message (items + wilaya + phone + name). */
const COMPLETE_MSG = "اسمي Ahmed، 2x iPhone 14 ب 8500 دج ف Alger، رقمي 0661234567";
/** Partial: has items + wilaya, no phone (confidence ~0.65, not complete). */
const PARTIAL_MSG = "2x écouteurs JBL 9000 DA Alger";
/** Non-order: no items, no wilaya, no phone (confidence 0). */
const NON_ORDER_MSG = "Bonjour, comment ça va?";

/** Build a Gemini-style result. */
function geminiResult(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    order: {
      items: [{ productName: "iPhone 14", quantity: 1, unitPrice: 85000 }],
      wilaya: "Alger",
      phone: "0661234567",
      customerName: "Ahmed",
    },
    method: "gemini",
    confidence: 0.9,
    isComplete: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(extractWithGemini).mockReset();
  vi.mocked(db.extractionMetric.create).mockResolvedValue({ id: "metric-1" } as never);
});

// ── extractOrder — regex wins ────────────────────────────────────────────────

describe("extractOrder — regex routing", () => {
  it("uses regex when it is confident and complete (skips Gemini)", async () => {
    const result = await extractOrder({ body: COMPLETE_MSG }, { geminiApiKey: "AIza-key" });

    expect(result.method).toBe("regex");
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.isComplete).toBe(true);
    expect(extractWithGemini).not.toHaveBeenCalled();
  });

  it("returns the partial regex result when confidence >= 0.3 and no Gemini key", async () => {
    const result = await extractOrder({ body: PARTIAL_MSG }, {});

    expect(result.method).toBe("regex");
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("phone");
    expect(extractWithGemini).not.toHaveBeenCalled();
  });

  it("returns the regex fallback (method=none) for a non-order message without a key", async () => {
    const result = await extractOrder({ body: NON_ORDER_MSG }, {});

    expect(result.method).toBe("none");
    expect(result.confidence).toBe(0);
    expect(result.order).toBeNull();
    expect(extractWithGemini).not.toHaveBeenCalled();
  });
});

// ── extractOrder — Gemini routing ────────────────────────────────────────────

describe("extractOrder — Gemini routing", () => {
  it("calls Gemini when regex is incomplete and a key is provided", async () => {
    vi.mocked(extractWithGemini).mockResolvedValue(geminiResult());

    const result = await extractOrder({ body: PARTIAL_MSG }, { geminiApiKey: "AIza-key" });

    expect(extractWithGemini).toHaveBeenCalledTimes(1);
    expect(extractWithGemini).toHaveBeenCalledWith(
      expect.objectContaining({ body: PARTIAL_MSG }),
      { apiKey: "AIza-key" },
    );
    expect(result.method).toBe("gemini");
    expect(result.isComplete).toBe(true);
  });

  it("calls Gemini when confidence is low (< 0.3) and a key is provided", async () => {
    vi.mocked(extractWithGemini).mockResolvedValue(geminiResult());

    const result = await extractOrder({ body: NON_ORDER_MSG }, { geminiApiKey: "AIza-key" });

    expect(extractWithGemini).toHaveBeenCalledTimes(1);
    expect(result.method).toBe("gemini");
  });

  it("falls back to regex when Gemini returns no order", async () => {
    vi.mocked(extractWithGemini).mockResolvedValue({
      order: null,
      method: "none",
      confidence: 0,
      isComplete: false,
      missingFields: ["all_models_failed"],
    });

    const result = await extractOrder({ body: PARTIAL_MSG }, { geminiApiKey: "AIza-key" });

    expect(result.method).toBe("regex");
    expect(result.isComplete).toBe(false);
    // Regex fallback re-runs extractWithRegex (returns the partial result)
    expect(result.missingFields).toContain("phone");
  });

  it("forceGemini=true skips regex and calls Gemini directly", async () => {
    vi.mocked(extractWithGemini).mockResolvedValue(geminiResult());

    const result = await extractOrder(
      { body: COMPLETE_MSG },
      { geminiApiKey: "AIza-key", forceGemini: true },
    );

    expect(extractWithGemini).toHaveBeenCalledTimes(1);
    expect(result.method).toBe("gemini");
  });

  it("forceGemini=true with a Gemini failure falls back to regex", async () => {
    vi.mocked(extractWithGemini).mockResolvedValue({
      order: null,
      method: "none",
      confidence: 0,
      isComplete: false,
      missingFields: ["all_models_failed"],
    });

    const result = await extractOrder(
      { body: COMPLETE_MSG },
      { geminiApiKey: "AIza-key", forceGemini: true },
    );

    // Regex fallback runs even though forceGemini skipped the first regex pass
    expect(result.method).toBe("regex");
    expect(extractWithGemini).toHaveBeenCalledTimes(1);
  });
});

// ── recordExtractionMetric ───────────────────────────────────────────────────

describe("recordExtractionMetric", () => {
  it("persists the metric via db.extractionMetric.create with all fields", async () => {
    await recordExtractionMetric({
      messageId: "msg-123",
      method: "gemini",
      confidence: 0.9,
      isComplete: true,
      fieldAccuracy: { phone: true, wilaya: false },
      latencyMs: 450,
      modelVersion: "gemini-2.5-flash",
    });

    expect(db.extractionMetric.create).toHaveBeenCalledWith({
      data: {
        messageId: "msg-123",
        method: "gemini",
        confidence: 0.9,
        isComplete: true,
        missingFields: null,
        fieldAccuracy: JSON.stringify({ phone: true, wilaya: false }),
        latencyMs: 450,
        modelVersion: "gemini-2.5-flash",
      },
    });
  });

  it("defaults messageId and modelVersion to null and serializes missingFields", async () => {
    await recordExtractionMetric({
      method: "regex",
      confidence: 0.4,
      isComplete: false,
      missingFields: ["phone", "wilaya"],
      latencyMs: 12,
    });

    expect(db.extractionMetric.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageId: null,
          modelVersion: null,
          missingFields: JSON.stringify(["phone", "wilaya"]),
          fieldAccuracy: null,
        }),
      }),
    );
  });

  it("swallows DB errors (never throws)", async () => {
    vi.mocked(db.extractionMetric.create).mockRejectedValue(new Error("DB down") as never);

    await expect(
      recordExtractionMetric({
        method: "regex",
        confidence: 0.5,
        isComplete: true,
        latencyMs: 10,
      }),
    ).resolves.toBeUndefined();
  });
});
