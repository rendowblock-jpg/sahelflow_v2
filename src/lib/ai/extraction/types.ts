/**
 * Extraction types — the shape of what regex/Gemini returns.
 *
 * Both the regex extractor and Gemini extractor return the same type,
 * so the smart router can treat them interchangeably.
 */

/** A single extracted order item */
export interface ExtractedItem {
  productName: string;
  quantity: number;
  unitPrice?: number; // DZD, may be absent if not mentioned
}

/** The result of extracting an order from a message */
export interface ExtractedOrder {
  /** Customer name (if detected) */
  customerName?: string;
  /** Phone number (if detected, normalized to 0XXXXXXXXX) */
  phone?: string;
  /** Wilaya name (normalized to match our wilayas.json) */
  wilaya?: string;
  /** Commune (if detected) */
  commune?: string;
  /** Address (if detected) */
  address?: string;
  /** Items ordered */
  items: ExtractedItem[];
  /** Total price mentioned in the message (if any) */
  totalPrice?: number;
  /** Notes / delivery instructions */
  notes?: string;
}

/** Which method extracted this order */
export type ExtractionMethod = "regex" | "gemini" | "none";

/** The full extraction result */
export interface ExtractionResult {
  /** The extracted order (null if extraction failed) */
  order: ExtractedOrder | null;
  /** Which method was used */
  method: ExtractionMethod;
  /** Confidence score 0-1 (how sure the extractor is) */
  confidence: number;
  /** Whether the extraction is complete enough to create an order */
  isComplete: boolean;
  /** What's missing (if incomplete) */
  missingFields?: string[];
  /** Raw extraction metadata (for debugging) */
  raw?: unknown;
}

/** Input to the extractor */
export interface ExtractionInput {
  /** The message body */
  body: string;
  /** The channel (whatsapp, tiktok, etc.) — may help with format detection */
  channel?: string;
  /** Existing customer phone (if the conversation has one) — helps matching */
  knownPhone?: string;
}
