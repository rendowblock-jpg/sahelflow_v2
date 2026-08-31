/**
 * Contextual "Ask AI" deep links from record surfaces into the agents
 * workspace (/agents?q=…).
 *
 * Design decision (R4-e): the URL carries only a short, seller-locale
 * sentence plus the record's public identifier — an order NUMBER or a
 * customer NAME. No phone numbers, addresses or other PII ever enter the
 * URL bar / history; the assistant resolves the full record through its
 * permission-checked tools (order lookup by order number) instead of
 * trusting URL-carried personal data.
 */

/** Deep-link prompts are short by design; full composer limit stays 4000. */
export const ASK_AI_PROMPT_MAX_LENGTH = 600;

/**
 * Normalize a `?q=` payload into a safe composer prefill: first value when
 * duplicated, control characters stripped, whitespace collapsed, hard
 * length cap.
 */
export function sanitizeAskAiPrompt(
  raw: string | string[] | undefined,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ASK_AI_PROMPT_MAX_LENGTH);
}

/** Build the /agents deep link that prefills the composer with `prompt`. */
export function askAiHref(prompt: string): string {
  return `/agents?q=${encodeURIComponent(prompt)}`;
}
