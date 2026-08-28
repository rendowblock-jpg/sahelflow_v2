/**
 * FRC-2 corpus contract tests.
 *
 * Executes the frozen extraction corpus (src/lib/ai/extraction/corpus) against:
 *  1. corpus integrity — identity, coverage and synthetic-phone provenance;
 *  2. the regex extractor — frozen observed truth per case;
 *  3. the Gemini output schema — every frozen expectation (regex + gemini +
 *     every prompt few-shot) must validate under ExtractedOrderSchema;
 *  4. the Gemini extractor — mocked round-trips for canonical answers;
 *  5. the smart router — regex shortcut, partial fallback, Gemini promotion.
 *
 * No network access happens in this suite; the Gemini path is fully mocked.
 */
import { describe, expect, it, vi } from "vitest";

import {
  CORPUS_FREEZE_DATE,
  CORPUS_VERSION,
  SYNTHETIC_PHONE_PATTERN,
  corpusCases,
  corpusInputFor,
  type CorpusOrderExpectation,
  type ExtractionCorpusCase,
} from "@/lib/ai/extraction/corpus/order-corpus";
import { extractWithRegex } from "@/lib/ai/extraction/regex-extractor";
import { ExtractedOrderSchema, extractWithGemini } from "@/lib/ai/extraction/gemini-extractor";
import { extractOrder } from "@/lib/ai/extraction/smart-router";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/ai/prompts/extraction";

const cases = corpusCases();

function languageCount(language: ExtractionCorpusCase["language"]): number {
  return cases.filter((c) => c.language === language).length;
}

function categoryCount(category: ExtractionCorpusCase["category"]): number {
  return cases.filter((c) => c.category === category).length;
}

/** Strip test-only fields so an expectation object can be schema-validated. */
function plainOrder(expectation: CorpusOrderExpectation): Record<string, unknown> {
  const plain: Record<string, unknown> = {};
  if (typeof expectation.customerName === "string") plain.customerName = expectation.customerName;
  if (expectation.phone !== undefined) plain.phone = expectation.phone;
  if (expectation.wilaya !== undefined) plain.wilaya = expectation.wilaya;
  if (expectation.items !== undefined) {
    plain.items = expectation.items.map((item) => {
      const mapped: Record<string, unknown> = {
        productName: item.productName ?? item.productNameContains ?? "",
        quantity: item.quantity ?? 1,
      };
      if (item.unitPrice !== undefined) mapped.unitPrice = item.unitPrice;
      return mapped;
    });
  }
  return plain;
}

function expectOrderMatches(expectation: CorpusOrderExpectation, order: NonNullable<ReturnType<typeof extractWithRegex>["order"]>): void {
  if (expectation.customerName === null) {
    expect(order.customerName, `${expectationNote()} customerName must be absent`).toBeUndefined();
  } else if (expectation.customerName !== undefined) {
    expect(order.customerName, `${expectationNote()} customerName`).toBe(expectation.customerName);
  }
  if (expectation.phone !== undefined) {
    expect(order.phone, `${expectationNote()} phone`).toBe(expectation.phone);
  }
  if (expectation.wilaya !== undefined) {
    expect(order.wilaya, `${expectationNote()} wilaya`).toBe(expectation.wilaya);
  }
  if (expectation.items !== undefined) {
    expect(order.items, `${expectationNote()} item count`).toHaveLength(expectation.items.length);
    expectation.items.forEach((item, index) => {
      const actual = order.items[index];
      expect(actual, `${expectationNote()} item ${index}`).toBeTruthy();
      if (!actual) return;
      if (item.productName !== undefined) {
        expect(actual.productName, `${expectationNote()} item ${index} productName`).toBe(item.productName);
      }
      if (item.productNameContains !== undefined) {
        expect(
          actual.productName.toLowerCase(),
          `${expectationNote()} item ${index} productNameContains`,
        ).toContain(item.productNameContains.toLowerCase());
      }
      if (item.quantity !== undefined) {
        expect(actual.quantity, `${expectationNote()} item ${index} quantity`).toBe(item.quantity);
      }
      if (item.unitPrice !== undefined) {
        expect(actual.unitPrice, `${expectationNote()} item ${index} unitPrice`).toBe(item.unitPrice);
      }
    });
  }
}

let currentCaseId = "";
function expectationNote(): string {
  return `[${currentCaseId}]`;
}

function runRegexExpectation(c: ExtractionCorpusCase): void {
  const frozen = c.regex;
  if (!frozen) return;
  currentCaseId = c.id;
  const result = extractWithRegex(corpusInputFor(c));

  if (frozen.order === null) {
    expect(result.order, `${expectationNote()} order must be null`).toBeNull();
    expect(result.method, `${expectationNote()} method`).toBe("none");
  } else {
    expect(result.order, `${expectationNote()} order must exist`).not.toBeNull();
    expect(result.method, `${expectationNote()} method`).toBe("regex");
    if (result.order) expectOrderMatches(frozen.order, result.order);
  }
  if (frozen.isComplete !== undefined) {
    expect(result.isComplete, `${expectationNote()} isComplete`).toBe(frozen.isComplete);
  }
  if (frozen.missingFields !== undefined) {
    expect([...(result.missingFields ?? [])].sort(), `${expectationNote()} missingFields`).toEqual(
      [...frozen.missingFields].sort(),
    );
  }
  if (frozen.minConfidence !== undefined) {
    expect(result.confidence, `${expectationNote()} confidence`).toBeGreaterThanOrEqual(frozen.minConfidence);
  }
}

function geminiOkResponse(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function withGeminiReply<T>(reply: string, run: (fetchSpy: ReturnType<typeof vi.fn>) => Promise<T>): Promise<T> {
  const fetchSpy = vi.fn().mockResolvedValue(geminiOkResponse(reply));
  vi.stubGlobal("fetch", fetchSpy);
  try {
    return await run(fetchSpy);
  } finally {
    vi.unstubAllGlobals();
  }
}

// ─── 1. Corpus integrity ─────────────────────────────────────────────────────

describe("order corpus — integrity", () => {
  it("is versioned and frozen", () => {
    expect(CORPUS_VERSION).toMatch(/^frc2-\d+\.\d+\.\d+$/);
    expect(CORPUS_FREEZE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has at least 40 unique well-formed case ids", () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Z]{2,6}-\d{3}$/);
  });

  it("covers every required language", () => {
    expect(languageCount("ar")).toBeGreaterThanOrEqual(6);
    expect(languageCount("arabizi")).toBeGreaterThanOrEqual(8);
    expect(languageCount("fr")).toBeGreaterThanOrEqual(6);
    expect(languageCount("en")).toBeGreaterThanOrEqual(3);
    expect(languageCount("mixed")).toBeGreaterThanOrEqual(8);
  });

  it("covers every required category", () => {
    expect(categoryCount("complete")).toBeGreaterThanOrEqual(9);
    expect(categoryCount("missing-field")).toBeGreaterThanOrEqual(4);
    expect(categoryCount("ambiguity-noise")).toBeGreaterThanOrEqual(5);
    expect(categoryCount("gemini-complement")).toBeGreaterThanOrEqual(4);
    expect(categoryCount("quantity-form")).toBeGreaterThanOrEqual(3);
    expect(categoryCount("phone-format")).toBeGreaterThanOrEqual(3);
    expect(categoryCount("multi-item")).toBeGreaterThanOrEqual(2);
    expect(categoryCount("price-format")).toBeGreaterThanOrEqual(2);
    for (const category of ["known-phone", "name-gap", "wilaya-number"] as const) {
      expect(categoryCount(category)).toBeGreaterThanOrEqual(1);
    }
  });

  it("every case carries at least one expectation", () => {
    for (const c of cases) {
      expect(c.regex !== undefined || c.gemini !== undefined, `${c.id} has no expectation`).toBe(true);
    }
  });

  it("only contains synthetic reserved-shape phone numbers", () => {
    for (const c of cases) {
      let working = c.message;
      const intlPattern = /\+?213[\s-]?[5-7](?:[\s-]?\d){8}/g;
      for (const match of working.match(intlPattern) ?? []) {
        const digits = match.replace(/\D/g, "");
        expect(digits, `${c.id} intl token length`).toHaveLength(12);
        expect(`0${digits.slice(3)}`, `${c.id} intl number ${match}`).toMatch(SYNTHETIC_PHONE_PATTERN);
      }
      working = working.replace(intlPattern, " ");
      const localPattern = /0[5-7](?:[\s-]?\d){8}/g;
      for (const match of working.match(localPattern) ?? []) {
        expect(match.replace(/[\s-]/g, ""), `${c.id} local number ${match}`).toMatch(SYNTHETIC_PHONE_PATTERN);
      }
      if (c.knownPhone !== undefined) {
        expect(c.knownPhone, `${c.id} knownPhone`).toMatch(SYNTHETIC_PHONE_PATTERN);
      }
      const regexPhone = c.regex?.order?.phone;
      if (typeof regexPhone === "string") {
        expect(regexPhone, `${c.id} regex phone`).toMatch(SYNTHETIC_PHONE_PATTERN);
      }
      const geminiPhone = c.gemini?.order?.phone;
      if (typeof geminiPhone === "string") {
        expect(geminiPhone, `${c.id} gemini phone`).toMatch(SYNTHETIC_PHONE_PATTERN);
      }
    }
  });
});

// ─── 2. Frozen regex truth ───────────────────────────────────────────────────

describe("order corpus — frozen regex extractor truth", () => {
  for (const c of cases) {
    if (!c.regex) continue;
    it(`${c.id} (${c.language}/${c.category})`, () => {
      runRegexExpectation(c);
    });
  }
});

// ─── 3. Schema parity ────────────────────────────────────────────────────────

describe("order corpus — ExtractedOrderSchema parity", () => {
  it("validates every frozen regex order expectation", () => {
    for (const c of cases) {
      if (!c.regex?.order) continue;
      const parsed = ExtractedOrderSchema.safeParse(plainOrder(c.regex.order));
      expect(parsed.success, `${c.id} regex expectation must satisfy ExtractedOrderSchema`).toBe(true);
    }
  });

  it("validates every frozen gemini canonical order", () => {
    for (const c of cases) {
      if (!c.gemini) continue;
      const parsed = ExtractedOrderSchema.safeParse(c.gemini.order);
      expect(parsed.success, `${c.id} gemini expectation must satisfy ExtractedOrderSchema`).toBe(true);
    }
  });

  it("validates every few-shot example output in the extraction prompt", () => {
    const outputs = EXTRACTION_SYSTEM_PROMPT.split("\n")
      .filter((line) => line.trimStart().startsWith("Output:"))
      .map((line) => line.trimStart().slice("Output:".length).trim());
    expect(outputs.length).toBe(7);
    for (const [index, output] of outputs.entries()) {
      let json: unknown;
      expect(() => { json = JSON.parse(output); }, `few-shot ${index + 1} must be JSON`).not.toThrow();
      const parsed = ExtractedOrderSchema.safeParse(json);
      expect(parsed.success, `few-shot ${index + 1} must satisfy ExtractedOrderSchema`).toBe(true);
    }
  });
});

// ─── 4. Gemini extractor round-trips (mocked provider) ──────────────────────

describe("order corpus — Gemini extractor canonical round-trips", () => {
  const roundTrips = ["MX-002", "AR-009", "GE-002"];

  for (const id of roundTrips) {
    it(`${id} returns the frozen canonical order`, async () => {
      const c = cases.find((candidate) => candidate.id === id);
      expect(c, `${id} exists`).toBeTruthy();
      expect(c?.gemini, `${id} has a gemini expectation`).toBeTruthy();
      if (!c?.gemini) return;

      await withGeminiReply(JSON.stringify(c.gemini.order), async (fetchSpy) => {
        const result = await extractWithGemini(corpusInputFor(c), { apiKey: "AIzaSYNTHETIC-CORPUS-KEY" });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(result.method).toBe("gemini");
        expect(result.confidence).toBe(0.9);
        expect(result.order).not.toBeNull();
        expect(result.order).toEqual(c.gemini?.order);
        expect(result.isComplete).toBe(true);
        expect(result.missingFields).toBeUndefined();
      });
    });
  }
});

// ─── 5. Smart-router rows ────────────────────────────────────────────────────

describe("order corpus — smart-router routing rows", () => {
  it("routes a complete high-confidence regex case without touching the provider", async () => {
    const c = cases.find((candidate) => candidate.id === "AR-001");
    expect(c).toBeTruthy();
    if (!c) return;
    await withGeminiReply("{}", async (fetchSpy) => {
      const result = await extractOrder(corpusInputFor(c));
      expect(result.method).toBe("regex");
      expect(result.isComplete).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it("keeps a partial regex result as the manual fallback when no key is configured", async () => {
    const c = cases.find((candidate) => candidate.id === "AR-004");
    expect(c).toBeTruthy();
    if (!c) return;
    await withGeminiReply("{}", async (fetchSpy) => {
      const result = await extractOrder(corpusInputFor(c));
      expect(result.method).toBe("regex");
      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain("phone");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it("promotes a wilaya-number case to Gemini and returns the canonical Oran answer", async () => {
    const c = cases.find((candidate) => candidate.id === "AR-009");
    expect(c?.gemini).toBeTruthy();
    if (!c?.gemini) return;
    await withGeminiReply(JSON.stringify(c.gemini.order), async (fetchSpy) => {
      const result = await extractOrder(corpusInputFor(c), { geminiApiKey: "AIzaSYNTHETIC-CORPUS-KEY" });
      expect(result.method).toBe("gemini");
      expect(result.order?.wilaya).toBe("Oran");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("honors forceGemini even for a complete regex case", async () => {
    const c = cases.find((candidate) => candidate.id === "MX-008");
    expect(c).toBeTruthy();
    if (!c) return;
    await withGeminiReply(JSON.stringify({
      phone: "0500000047",
      wilaya: "Oran",
      items: [{ productName: "CASQUE BLUETOOTH", quantity: 2, unitPrice: 4500 }],
    }), async (fetchSpy) => {
      const result = await extractOrder(corpusInputFor(c), {
        geminiApiKey: "AIzaSYNTHETIC-CORPUS-KEY",
        forceGemini: true,
      });
      expect(result.method).toBe("gemini");
      expect(result.order?.items[0]?.quantity).toBe(2);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
