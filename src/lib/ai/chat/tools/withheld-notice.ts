/**
 * What the remote model is told when the signed-in member's role may not see
 * some fields of a tool result (order total, delivery cost, unit prices, cost,
 * contact data).
 *
 * The registry gate REMOVES those fields, and the redaction layer rebuilds each
 * object with null for anything missing, so the model used to read
 * `totalPrice: null` and tell the member the amount was "not set". The gate now
 * also reports which paths it removed. The agent stores the result as a small
 * envelope, and the model is shown the normally redacted data PLUS those names
 * PLUS one constant sentence. Nothing here carries a value: only names from the
 * fixed vocabulary of the read-access table, and a sentence written in this
 * file. A tool body cannot forge it: a look-alike object is accepted only when
 * it has exactly the two keys and every name is in the vocabulary, and the
 * sentence is never read from the value.
 */
import { CHAT_WITHHOLDABLE_PATHS } from "./read-access";

export const AI_WITHHELD_NOTE =
  "WITHHELD: the signed-in member's role is not allowed to see the fields listed in withheld_for_role. " +
  "They are null or missing here because they are hidden from this role, not because they are empty, zero or unset. " +
  "Never say they are not set, zero or unknown; tell the seller plainly that this member's role cannot see them.";

export interface AiWithheldEnvelope {
  withheld_for_role: string[];
  data: unknown;
}

const ENVELOPE_KEYS = new Set(["withheld_for_role", "data"]);

/** The stored form: the data plus the names of the fields the role cannot see. No names: the data as it is. */
export function aiWithheldEnvelope(data: unknown, paths: readonly string[]): unknown {
  const names = [...new Set(paths)].filter((path) => CHAT_WITHHOLDABLE_PATHS.has(path));
  if (names.length === 0) return data;
  return { withheld_for_role: names, data: data === undefined ? null : data };
}

/** Reads the stored form back. Accepts exactly what `aiWithheldEnvelope` builds and nothing else. */
export function parseAiWithheldEnvelope(
  value: unknown,
): { paths: string[]; data: unknown } | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.every((key) => ENVELOPE_KEYS.has(key))) return null;
  const list = record.withheld_for_role;
  if (!Array.isArray(list) || list.length === 0 || list.length > CHAT_WITHHOLDABLE_PATHS.size) return null;
  const seen = new Set<string>();
  for (const path of list) {
    if (typeof path !== "string" || !CHAT_WITHHOLDABLE_PATHS.has(path) || seen.has(path)) return null;
    seen.add(path);
  }
  return { paths: [...seen], data: record.data };
}

/** What the model reads: its (already redacted) data, the names, and the fixed sentence. */
export function aiWithheldForModel(paths: readonly string[], redactedData: unknown) {
  return { data: redactedData, withheld_for_role: [...paths], note: AI_WITHHELD_NOTE };
}
