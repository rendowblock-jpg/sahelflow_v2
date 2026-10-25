/**
 * Golden set: types and the small builder the part files share.
 *
 * WHY A SECOND SET: the frozen corpus (corpus/order-corpus.ts) has 41 messages,
 * 12 with a canonical answer, and the offline reader was tuned until it matched
 * them, so it cannot show accuracy. This set is written for the purpose, by
 * MEANING: what a careful human reads in the message, never what the extractor
 * returns. Nothing here is copied from a real customer.
 *
 * LABEL RULES
 * - `expected` carries only what the message really states. A field that is
 *   missing from `expected` means "the message does not say".
 * - `phone` is the normalised number (0XXXXXXXXX) even when the text writes it
 *   with spaces, dots, +213, 00213 or Arabic-Indic digits.
 * - `wilaya` is the canonical name of data/wilayas.json (the project table).
 * - `productName` is the product as the customer wrote it (same script and
 *   language), without greeting or filler words. A colour or size the customer
 *   attaches to the product may be part of the name.
 * - A message with several products carries `items`; then `productName` and
 *   `quantity` are left out.
 * - A message that only asks, complains, greets, cancels, or tries to give the
 *   assistant instructions is `isOrder: false`.
 * - Every phone is fake (see FAKE_PHONE_PATTERNS in the structure test).
 */

export type GoldenLanguage = "ar" | "arabizi" | "fr" | "mixed" | "ar-msa";
export type GoldenSource = "whatsapp-order" | "messenger-order" | "not-an-order";

export interface GoldenItem {
  productName: string;
  quantity: number;
  /** Price of ONE unit, only when the message gives it. */
  unitPrice?: number;
}

export interface GoldenExpected {
  isOrder: boolean;
  productName?: string;
  quantity?: number;
  /** Price of one unit when the message states it for a single product. */
  unitPrice?: number;
  /** Several products in one message (instead of productName/quantity). */
  items?: GoldenItem[];
  /** A total the customer wrote for the whole order. */
  totalPrice?: number;
  customerName?: string;
  /** Normalised 0XXXXXXXXX. */
  phone?: string;
  /** Canonical name from data/wilayas.json. */
  wilaya?: string;
  commune?: string;
  address?: string;
  /** Delivery instruction the customer gave (free text, meaning only). */
  notes?: string;
}

export interface GoldenEntry {
  id: string;
  language: GoldenLanguage;
  source: GoldenSource;
  text: string;
  expected: GoldenExpected;
  /** Shape of the message, used to split the baseline by difficulty. */
  tags?: string[];
}

/** Builders for one part file: fixes language and id prefix. */
export function goldenBuilders(language: GoldenLanguage, prefix: string) {
  const make =
    (source: GoldenSource) =>
    (n: number, text: string, expected: GoldenExpected, tags: string[] = []): GoldenEntry => ({
      id: `${prefix}-${String(n).padStart(3, "0")}`,
      language,
      source,
      text,
      expected,
      ...(tags.length > 0 ? { tags } : {}),
    });
  const none = make("not-an-order");
  return {
    wa: make("whatsapp-order"),
    ms: make("messenger-order"),
    /** A message that must produce no order. */
    no: (n: number, text: string, tags: string[] = []): GoldenEntry =>
      none(n, text, { isOrder: false }, tags),
  };
}
