/**
 * Gemini extractor — uses Google AI Studio (Gemini 3.5 Flash) for complex messages.
 *
 * The API key is the seller's own free-tier key (stored in OS keychain).
 * This module makes the actual API call and parses the response.
 *
 * Fallback: if Gemini is unavailable or rate-limited, returns a "none" result
 * and the smart router falls back to manual entry.
 */

import { z } from "zod";
import type { ExtractedOrder, ExtractionResult, ExtractionInput } from "./types";

// Session 30 (AUDIT-7 AI2): runtime schema for the Gemini response.
// Mirrors the ExtractedOrder type but with runtime validation + coercion.
export const ExtractedOrderSchema = z.object({
  customerName: z.string().optional(),
  phone: z.string().optional(),
  wilaya: z.string().optional(),
  commune: z.string().optional(),
  address: z.string().optional(),
  items: z.array(z.object({
    productName: z.string(),
    quantity: z.number().int().min(1).or(z.string().transform((v, ctx) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1) {
        ctx.addIssue({ code: "custom", message: "Invalid quantity" });
        return z.NEVER;
      }
      return n;
    })),
    unitPrice: z.number().min(0).optional().or(z.string().transform((v, ctx) => {
      const n = parseFloat(v);
      if (isNaN(n) || n < 0) {
        ctx.addIssue({ code: "custom", message: "Invalid unitPrice" });
        return z.NEVER;
      }
      return n;
    })).optional(),
  })).min(0),
  totalPrice: z.number().min(0).optional().or(z.string().transform((v, ctx) => {
    const n = parseFloat(v);
    if (isNaN(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Invalid totalPrice" });
      return z.NEVER;
    }
    return n;
  })).optional(),
  notes: z.string().optional(),
});
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

  // Session 30 (AUDIT-7 AI2): zod-validate the response. Previously this
  // did JSON.parse + `as ExtractedOrder` — hallucinated fields (e.g.
  // quantity: "two", unitPrice: "free") passed through silently and broke
  // downstream consumers.
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Try to extract JSON from the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  const result = ExtractedOrderSchema.safeParse(parsed);
  if (!result.success) {
    // Log the validation errors for debugging
    console.warn("[extraction] Gemini response failed zod validation:", result.error.issues);
    return null;
  }
  return result.data;
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
      const url = `${GEMINI_API_URL}/${model}:generateContent`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
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

/**
 * Verify a Gemini API key with a minimal generateContent call.
 * Used by the key-wizard (Settings → AI) to test before saving.
 *
 * Returns the first model that accepted the key (so the UI can show which
 * model will be used), or an error message.
 */
export async function verifyGeminiKey(
  apiKey: string,
  timeoutMs = 10000,
): Promise<{ ok: boolean; model?: string; error?: string }> {
  if (!apiKey || !apiKey.startsWith("AIza")) {
    return { ok: false, error: "Le format de la clé semble invalide (doit commencer par AIza)." };
  }

  for (const model of MODELS) {
    try {
      const url = `${GEMINI_API_URL}/${model}:generateContent`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { ok: true, model };
      }
      const errorBody = (await response.json().catch(() => ({}))) as GeminiResponse;

      if (response.status === 400 || response.status === 404) {
        // Model not available for this key — try the next one
        continue;
      }
      if (response.status === 403) {
        return { ok: false, error: "Clé refusée (403). Vérifiez qu'elle est active et que l'API Generative Language est activée." };
      }
      if (response.status === 429) {
        // Key works but rate-limited — treat as valid
        return { ok: true, model, error: "Valide mais quota atteint (429). Réessayez plus tard." };
      }
      return {
        ok: false,
        error: errorBody.error?.message ?? `Erreur HTTP ${response.status}`,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: "Délai dépassé. Vérifiez votre connexion." };
      }
      // Network error — try next model
      continue;
    }
  }

  return {
    ok: false,
    error: "Aucun modèle Gemini disponible pour cette clé. Vérifiez que l'API Generative Language est activée dans Google AI Studio.",
  };
}
