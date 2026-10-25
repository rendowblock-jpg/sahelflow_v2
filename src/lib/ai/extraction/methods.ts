/**
 * Which readers count as "an AI read this message". The names are the provider ids of the quota ledger
 * (a test pins that), so a provider added to the router cannot be forgotten by the places that need this list:
 * the save-order route (which reader produced the draft) and the review card (does it say "AI read it").
 * Pure, so the browser bundle can import it.
 */
export const AI_EXTRACTION_METHODS = ["gemini", "groq", "openai"] as const;
export type AiExtractionMethod = (typeof AI_EXTRACTION_METHODS)[number];

/** Every value the save-order route accepts for the reader of a draft: the offline reader or one of the AIs. */
export const SAVED_EXTRACTION_METHODS = ["regex", ...AI_EXTRACTION_METHODS] as const;

export function isAiExtractionMethod(method: string): method is AiExtractionMethod {
  return (AI_EXTRACTION_METHODS as readonly string[]).includes(method);
}
