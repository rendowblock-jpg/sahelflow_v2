/**
 * Grounding for model answers: a model may not invent what the message does
 * not say. A price the customer never wrote, or a "commune" that is only the
 * wilaya repeated, is dropped here; the seller confirms the rest on the
 * review sheet. Used by canonicalizeOrder, only when it is given the message.
 */
import { fold, normalizeMessage } from "./text";

const SEPARATOR = "[ .,'٬]";
const NUMBER_TOKEN = new RegExp(
  `(?<!\\p{N})(?<int>\\d+(?:${SEPARATOR}\\d{3}(?!\\d))*)(?:[.,٫](?<frac>\\d{1,2})(?!\\d))?` +
    // "95k", "95 k", "95 ألف" (folded: الف), "95 mille(s)". "95kda" counts, "5kg" does not.
    `(?<scale>\\s?(?:k(?:(?![\\p{L}\\p{N}])|(?=d[az]))|الف|الاف|milles?(?![\\p{L}\\p{N}])))?`,
  "gu",
);

/**
 * Every positive number the message states as a standalone token: digits of
 * any family, thousands separators ("95 000", "95.000", "95,000", "95'000")
 * and the short forms "95k" / "95 ألف" / "95 mille" (= 95000). A number inside
 * a longer number is not a token. The parts of a grouped number count too
 * ("2 500" may be a quantity and a price), so this errs toward keeping.
 */
export function numbersInMessage(body: string): Set<number> {
  const found = new Set<number>();
  const add = (value: number) => {
    if (Number.isFinite(value) && value > 0) found.add(value);
  };
  const text = fold(normalizeMessage(body));
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const parts = (match.groups?.int ?? "").split(new RegExp(SEPARATOR));
    const whole = Number(parts.join(""));
    const frac = match.groups?.frac;
    const value = frac === undefined ? whole : Number(`${whole}.${frac}`);
    for (const part of parts) add(Number(part));
    add(value);
    if (match.groups?.scale) add(Math.round(value * 1000));
  }
  return found;
}

/** A model price counts as written when its rounded or exact value is a number token of the message. */
export function priceIsWritten(price: number, written: ReadonlySet<number>): boolean {
  return price > 0 && (written.has(price) || written.has(Math.round(price)));
}
