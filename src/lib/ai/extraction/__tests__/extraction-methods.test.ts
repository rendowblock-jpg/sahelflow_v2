/**
 * Found by reading the consumers of method === "groq" after w46 added ChatGPT as a third provider (25 Oct):
 * the save-order route accepted only regex|gemini|groq (an order read through a ChatGPT plan was refused with a 400)
 * and the review card's "an AI read it" check named gemini and groq only. One shared list now feeds both, and this
 * test fails the moment a provider is added to the quota ledger without being an AI reading method.
 */
import { describe, expect, it } from "vitest";

import { AI_EXTRACTION_METHODS, SAVED_EXTRACTION_METHODS, isAiExtractionMethod } from "@/lib/ai/extraction/methods";
import { AI_PROVIDER_IDS } from "@/lib/ai/providers/quota-ledger";

describe("extraction methods", () => {
  it("every AI provider the router can ask is an AI reading method", () => {
    for (const provider of AI_PROVIDER_IDS) {
      expect(isAiExtractionMethod(provider), provider).toBe(true);
    }
    expect([...AI_EXTRACTION_METHODS].sort()).toEqual([...AI_PROVIDER_IDS].sort());
  });

  it("the offline reader and 'none' are not AI reads", () => {
    expect(isAiExtractionMethod("regex")).toBe(false);
    expect(isAiExtractionMethod("none")).toBe(false);
    expect(isAiExtractionMethod("")).toBe(false);
  });

  it("a saved order may be marked regex or by any AI method, and nothing else", () => {
    expect([...SAVED_EXTRACTION_METHODS].sort()).toEqual(["regex", ...AI_PROVIDER_IDS].sort());
  });
});
