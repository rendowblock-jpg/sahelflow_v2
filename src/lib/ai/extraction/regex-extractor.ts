/**
 * Regex extractor — parses Algerian COD messages without AI.
 *
 * Handles the ~70% of messages that follow predictable patterns.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import type { ExtractedItem, ExtractedOrder, ExtractionResult, ExtractionInput } from "./types";

interface Wilaya {
  code: number;
  name: string;
  nameAr: string;
  zone: string;
}

// Cache wilayas (loaded once at first use)
let wilayasCache: Wilaya[] | null = null;

function getWilayas(): Wilaya[] {
  if (wilayasCache) return wilayasCache;
  try {
    const paths = [
      resolve(process.cwd(), "data/wilayas.json"),
      resolve(process.cwd(), "../data/wilayas.json"),
    ];
    for (const p of paths) {
      try {
        const data: Wilaya[] = JSON.parse(readFileSync(p, "utf-8")); wilayasCache = data;
        return data;
      } catch { /* try next */ }
    }
  } catch { /* empty */ }
  wilayasCache = [];
  return [];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ARABIC_DIGITS = /[٠-٩]/g;

function normalizeDigits(s: string): string {
  return s.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));
}

function normalize(text: string): string {
  return normalizeDigits(text).trim().replace(/\s+/g, " ");
}

function parsePrice(s: string): number | undefined {
  const match = s.match(/(\d[\d\s.]*)\s*(?:دج|da|dzd|د\.ج)?/i);
  if (!match?.[1]) return undefined;
  const num = parseInt(match[1].replace(/[\s.]/g, ""), 10);
  return isNaN(num) ? undefined : num;
}

function findWilaya(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const w of getWilayas()) {
    if (lower.includes(w.name.toLowerCase())) return w.name;
    if (text.includes(w.nameAr)) return w.name;
  }
  return undefined;
}

function findPhone(text: string): string | undefined {
  const match = text.match(/0[5-7]\d{8}/);
  if (match) return match[0];
  const spaced = text.match(/0[5-7][\s-]?\d(?:[\s-]?\d){7}/);
  if (spaced) return spaced[0].replace(/[\s-]/g, "");
  return undefined;
}

function extractItems(text: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  let match: RegExpExecArray | null;

  // Pattern 1: "Xx product price"
  const pattern1 = /(\d+)\s*(?:x|×|fois|قطعة|حبة)\s+(.+?)\s+(\d[\d\s.]*\s*(?:دج|da|dzd|د\.ج)?)(?:\s|$|,|;)/gi;
  while ((match = pattern1.exec(text)) !== null) {
    const quantity = parseInt(match[1] ?? "0", 10);
    const productName = (match[2] ?? "").trim();
    const unitPrice = parsePrice(match[3] ?? "");
    if (productName && quantity > 0) {
      items.push({ productName, quantity, unitPrice });
    }
  }

  // Pattern 2: "product price" (quantity = 1)
  if (items.length === 0) {
    const pattern2 = /([a-zA-Z\u0600-\u06FF][a-zA-Z0-9\u0600-\u06FF\s]{2,30}?)\s+(\d{3,6})\s*(?:دج|da|dzd|د\.ج)?(?:\s|$|,|;)/gi;
    while ((match = pattern2.exec(text)) !== null) {
      const productName = (match[1] ?? "").trim();
      const unitPrice = parseInt(match[2] ?? "0", 10);
      if (productName.length < 3) continue;
      if (["le", "la", "les", "de", "et", "the", "for"].includes(productName.toLowerCase())) continue;
      items.push({ productName, quantity: 1, unitPrice });
    }
  }

  // Pattern 3: Arabic "بغيت نشرى X"
  if (items.length === 0) {
    const pattern3 = /(?:بغيت|نبغي|نبي|نحب)\s+(?:نشرى|نشري|نشري)\s+(.+?)(?:\s+(?:ب|في|فيها|عند)\s|$)/i;
    match = pattern3.exec(text);
    if (match?.[1]) {
      items.push({ productName: match[1].trim(), quantity: 1 });
    }
  }

  return items;
}

function findCustomerName(text: string): string | undefined {
  // Pattern 1: Arabic intro + Latin name (stop at comma or Arabic)
  const latinAfterArabic = /(?:اسمي|سميتي)\s+([A-Za-z][A-Za-z\s]{1,29}?)(?:[،,\u0600-\u06FF]|$)/i;
  // Pattern 2: Arabic intro + Arabic name (stop at comma or Latin)
  const arabicAfterArabic = /(?:اسمي|سميتي)\s+([\u0600-\u06FF][\u0600-\u06FF\s]{1,29}?)(?:[،,A-Za-z]|$)/i;
  // Pattern 3: French intro + Latin name (stop at comma)
  const frenchPattern = /(?:je m[''\u2019]appelle|je m appelle|moi c[''\u2019]est)\s+([A-Za-z][A-Za-z\s]{1,29}?)(?:[،,]|$)/i;
  // Pattern 4: "ana" + name (stop at comma)
  const anaPattern = /(?:ana|أنا)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s]{1,29}?)(?:[،,]|$)/i;

  for (const pattern of [latinAfterArabic, arabicAfterArabic, frenchPattern, anaPattern]) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim().split(/\s+/).slice(0, 2).join(" ");
      if (name.length >= 2) return name;
    }
  }
  return undefined;
}

// ─── Main extractor ──────────────────────────────────────────────────────────

export function extractWithRegex(input: ExtractionInput): ExtractionResult {
  const text = normalize(input.body);
  const missingFields: string[] = [];

  const items = extractItems(text);
  const wilaya = findWilaya(text);
  const phone = findPhone(text) ?? input.knownPhone;
  const customerName = findCustomerName(text);

  const order: ExtractedOrder = {
    items,
    wilaya,
    phone,
    customerName,
  };

  if (items.length === 0) missingFields.push("items");
  if (!wilaya) missingFields.push("wilaya");
  if (!phone) missingFields.push("phone");

  const isComplete = items.length > 0 && !!wilaya && !!phone;

  let confidence = 0;
  if (items.length > 0) confidence += 0.4;
  if (wilaya) confidence += 0.25;
  if (phone) confidence += 0.2;
  if (customerName) confidence += 0.15;

  return {
    order: items.length > 0 ? order : null,
    method: items.length > 0 ? "regex" : "none",
    confidence,
    isComplete,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
  };
}
