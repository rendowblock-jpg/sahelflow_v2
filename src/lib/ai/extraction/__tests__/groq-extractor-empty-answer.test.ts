/**
 * Found by the live Groq run on the golden set (25 Oct): for a message that is not an order, Groq's JSON mode
 * answers with an empty object `{}` (no "items" at all). Gemini's schema mode always sends "items": [].
 * The reader refused `{}` as GROQ_INVALID_EXTRACTION, so (a) the card said the AI failed and (b) the router spent
 * a Gemini request on a message the AI had already understood. A missing or null "items" means "no items".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { extractWithGroq } from "@/lib/ai/extraction/groq-extractor";

const KEY = ["gs", "k_", "SyntheticSyntheticSynthetic1234"].join("");
const INPUT = { body: "synthetic: wach kayen livraison l wahran ?" };
const fetchSpy = vi.fn();
const completion = (content: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
      usage: { prompt_tokens: 3275, completion_tokens: 12, total_tokens: 3287 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe("extractWithGroq and answers without items", () => {
  it.each([
    ["an empty object", "{}"],
    ["items null", '{"items": null}'],
    ["only other fields", '{"customerName": null, "phone": null, "wilaya": "Oran"}'],
  ])("reads %s as 'the AI found no items', not as a failed AI", async (_label, content) => {
    fetchSpy.mockResolvedValue(completion(content));
    const result = await extractWithGroq(INPUT, { apiKey: KEY });
    expect(result.missingFields ?? []).not.toContain("GROQ_INVALID_EXTRACTION");
    expect(result.method).toBe("groq");
    expect(result.order?.items).toEqual([]);
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("items");
  });

  it("still refuses answers that are really invalid (control)", async () => {
    for (const content of ['{"items":"nope"}', "[]", '"just text"', "not json", '{"items":[{"productName":"x","quantity":null}]}']) {
      fetchSpy.mockResolvedValueOnce(completion(content));
      const result = await extractWithGroq(INPUT, { apiKey: KEY });
      expect(result.order, content).toBeNull();
      expect(result.missingFields, content).toEqual(["GROQ_INVALID_EXTRACTION"]);
    }
  });
});
