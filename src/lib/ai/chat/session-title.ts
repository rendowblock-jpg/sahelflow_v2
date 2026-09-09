/**
 * Durable AI session titles derived from the seller's own first message.
 *
 * UI-05 — the previous derivation was `message.slice(0, 50)` inlined in both
 * message routes. Three things were wrong with it, and all three are visible in
 * the work-history rail rather than theoretical:
 *
 * 1. **It cuts mid-word.** A 50-character slice lands wherever it lands, so the
 *    rail is a column of clipped fragments. The register recorded this as
 *    reading badly in RTL specifically, and it does — but it reads badly in
 *    every locale; Arabic just makes it obvious.
 * 2. **It cuts mid-character.** `String.prototype.slice` counts UTF-16 code
 *    units, so a prompt containing an emoji or any astral-plane character can be
 *    cut through a surrogate pair, storing a lone surrogate in the title column.
 * 3. **It keeps the raw newlines.** A pasted multi-line prompt became a title
 *    with embedded line breaks, which the rail then rendered as a single run-on
 *    line and the canvas header truncated unpredictably.
 *
 * The title is the seller's own words, so it stays locale-neutral by
 * construction — no generated or translated string is introduced, which is what
 * `ai-workspace-contract.test.ts` protects when it forbids a hardcoded
 * `"Nouvelle conversation"`.
 *
 * Privacy: `AiChatSession` and `AiChatMessage` sit in the same `personal-data`
 * group in `documentation/privacy/phase4-data-inventory.json` — same retention
 * class, same export, backup and erase treatment — so deriving a title from a
 * message body moves nothing across a classification boundary.
 */

/** Bound kept at the historical 50 so existing titles stay comparable. */
export const AI_SESSION_TITLE_MAX_LENGTH = 50;

/** Legacy seed written by an older client before titles were locale-neutral. */
export const LEGACY_AI_SESSION_TITLE = "Nouvelle conversation";

/**
 * True when a session still carries no seller-meaningful title and should take
 * one from its first message.
 */
export function isDerivableAiSessionTitle(title: string | null): boolean {
  if (!title) return true;
  return title.trim() === LEGACY_AI_SESSION_TITLE;
}

/**
 * Collapse a raw prompt into a single-line title, cut on a word boundary and
 * never through a character.
 *
 * Returns an empty string when the message carries nothing renderable, so the
 * caller can leave the title null rather than storing whitespace.
 */
export function deriveAiSessionTitle(
  message: string,
  maxLength: number = AI_SESSION_TITLE_MAX_LENGTH,
): string {
  // One line, one space between words — a pasted multi-line prompt must not
  // become a title with embedded breaks.
  const normalized = message.replace(/\s+/gu, " ").trim();
  if (!normalized) return "";

  // Code points, not UTF-16 units: never cut through a surrogate pair.
  const points = Array.from(normalized);
  if (points.length <= maxLength) return normalized;

  const clipped = points.slice(0, maxLength).join("");

  // Prefer the last word boundary, but only when it leaves a useful title.
  // Scripts that do not space words (and single long tokens) fall through to
  // the hard bound rather than collapsing to a stub.
  const lastSpace = clipped.lastIndexOf(" ");
  const body = lastSpace >= Math.floor(maxLength / 2)
    ? clipped.slice(0, lastSpace)
    : clipped;

  // Strip trailing punctuation left dangling by the cut before the ellipsis.
  return `${body.replace(/[\s\p{P}]+$/u, "")}…`;
}
