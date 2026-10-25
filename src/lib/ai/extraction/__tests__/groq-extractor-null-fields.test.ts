/**
 * Groq's JSON mode has no schema, so the model writes "unitPrice": null for "not stated"
 * (Gemini's schema mode never does). Found by the first live Groq calls on the golden set:
 * 2 of 3 correct answers were refused as GROQ_INVALID_EXTRACTION. A null field means absent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { extractWithGroq } from "@/lib/ai/extraction/groq-extractor";

const KEY = ["gs", "k_", "SyntheticSyntheticSynthetic1234"].join("");
const INPUT = { body: "synthetic: robe rouge taille 38, 0555123456, Oran" };
const fetchSpy = vi.fn();
const completion = (content: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
      usage: { prompt_tokens: 3275, completion_tokens: 95, total_tokens: 3370 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe("extractWithGroq and null fields", () => {
  it("reads an answer that writes null for every field it does not know", async () => {
    fetchSpy.mockResolvedValue(
      completion(
        JSON.stringify({
          customerName: null,
          phone: "0555123456",
          wilaya: "Oran",
          commune: null,
          address: null,
          items: [{ productName: "robe rouge", quantity: 1, unitPrice: null }],
          totalPrice: null,
          notes: null,
        }),
      ),
    );
    const result = await extractWithGroq(INPUT, { apiKey: KEY });
    expect(result.missingFields ?? []).not.toContain("GROQ_INVALID_EXTRACTION");
    expect(result.method).toBe("groq");
    expect(result.order?.items).toEqual([{ productName: "robe rouge", quantity: 1 }]);
    expect(result.order?.phone).toBe("0555123456");
  });

  it("still refuses an answer that is really invalid (control: only optional fields gained leniency)", async () => {
    for (const content of [
      '{"items":"nope"}',
      '{"items":[{"productName":null,"quantity":1}]}',
      '{"items":[{"productName":"robe","quantity":null}]}',
    ]) {
      fetchSpy.mockResolvedValueOnce(completion(content));
      const result = await extractWithGroq(INPUT, { apiKey: KEY });
      expect(result.order).toBeNull();
      expect(result.missingFields).toEqual(["GROQ_INVALID_EXTRACTION"]);
    }
  });
});
