/**
 * Extraction types — the shape of what regex/Gemini returns.
 *
 * Both the regex extractor and Gemini extractor return the same type,
 * so the smart router can treat them interchangeably.
 */

import type { ExtractionCatalogEntry } from "./catalog";

export type { ExtractionCatalogEntry };

/** A single extracted order item */
export interface ExtractedItem {
  productName: string;
  quantity: number;
  unitPrice?: number; // DZD, may be absent if not mentioned
  /** Set when the name was mapped onto the seller's catalog (FD-064). */
  catalogMatch?: "exact" | "close";
  /** What the customer actually wrote, when it was mapped onto the catalog. */
  sourceText?: string;
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
  /** No item was found, but these customer/delivery details were (FD-064). */
  partial?: ExtractedOrder;
  /** Why Gemini could not help this time (the offline reading was kept). */
  aiFailure?: string;
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
  /** The seller's active catalog identities, so items land on real products. */
  catalog?: ExtractionCatalogEntry[];
}

/** Ledger AI-21 — input to the visual (screenshot) extractor. The MIME type
 *  is the magic-number-sniffed truth, never the browser declaration. */
export interface ExtractionImageInput {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}
