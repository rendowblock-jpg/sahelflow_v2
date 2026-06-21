/**
 * Gemini extractor — uses Google AI Studio (Gemini 3.5 Flash) for complex messages.
 *
 * The API key is the seller's own free-tier key (stored in OS keychain).
 * This module makes the actual API call and parses the response.
 *
 * Fallback: if Gemini is unavailable or rate-limited, returns a "none" result
 * and the smart router falls back to manual entry.
 */

import type { ExtractedOrder, ExtractionResult, ExtractionInput } from "./types";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "../prompts/extraction";

// Gemini API endpoint (Google AI Studio)
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Models to try, in order of preference */
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message: string; status: string };
}

/** Parse the JSON from Gemini's response (it may have markdown fences) */
function parseGeminiResponse(text: string): ExtractedOrder | null {
  // Strip markdown code fences if present
  let json = text.trim();
  if (json.startsWith("```")) {
    json = json.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(json);
    // Validate the shape
    if (!parsed.items || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed as ExtractedOrder;
  } catch {
    // Try to extract JSON from the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export interface GeminiExtractorOptions {
  apiKey: string;
  /** Timeout in ms (default 15s) */
  timeoutMs?: number;
}

export async function extractWithGemini(
  input: ExtractionInput,
  options: GeminiExtractorOptions,
): Promise<ExtractionResult> {
  const { apiKey, timeoutMs = 15000 } = options;

  if (!apiKey) {
    return {
      order: null,
      method: "none",
      confidence: 0,
      isComplete: false,
      missingFields: ["apiKey"],
    };
  }

  const userPrompt = EXTRACTION_USER_PROMPT(input.body);

  // Try each model in order until one works
  for (const model of MODELS) {
    try {
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.1, // Low temperature for consistent extraction
            maxOutputTokens: 1024,
          },
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})) as GeminiResponse;
        // 429 = rate limit, don't retry with next model
        if (response.status === 429) {
          return {
            order: null,
            method: "none",
            confidence: 0,
            isComplete: false,
            missingFields: ["rate_limited"],
          };
        }
        // 400 = model not available, try next
        if (response.status === 400 || response.status === 404) {
          continue;
        }
        // Other errors: return failure
        return {
          order: null,
          method: "none",
          confidence: 0,
          isComplete: false,
          missingFields: [errorBody.error?.message ?? `HTTP ${response.status}`],
        };
      }

      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        continue;
      }

      const order = parseGeminiResponse(text);
      if (!order) {
        continue;
      }

      // Check completeness
      const missingFields: string[] = [];
      if (!order.items || order.items.length === 0) missingFields.push("items");
      if (!order.wilaya) missingFields.push("wilaya");
      if (!order.phone) missingFields.push("phone");

      return {
        order,
        method: "gemini",
        confidence: 0.9, // Gemini is high confidence when it returns
        isComplete: order.items.length > 0 && !!order.wilaya && !!order.phone,
        missingFields: missingFields.length > 0 ? missingFields : undefined,
      };
    } catch (err) {
      // Network error or timeout — try next model
      if (err instanceof Error && err.name === "AbortError") {
        continue;
      }
      continue;
    }
  }

  // All models failed
  return {
    order: null,
    method: "none",
    confidence: 0,
    isComplete: false,
    missingFields: ["all_models_failed"],
  };
}
