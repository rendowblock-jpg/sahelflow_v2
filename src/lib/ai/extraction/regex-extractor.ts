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
  // AI-M11: handle the three common Algerian price formats:
  //   1. "3500"            → plain integer
  //   2. "3.500" / "3 500" → dot/space thousands separator (was already handled)
  //   3. "3,500"           → comma thousands separator (was MISSED — the comma
  //                         broke the \d[\d\s.]* match and the whole price
  //                         was dropped, returning undefined)
  //   4. "3500,50"         → comma DECIMAL separator (was parsed as 350050 —
  //                         100× too big — because the comma was stripped and
  //                         the digits concatenated). Round to int (DZD has
  //                         no sub-unit in practice for COD).
  //
  // Strategy: capture digits + separators, then:
  //   - if a comma is followed by exactly 2 digits at the end → decimal comma
  //     (convert to dot, parse as float, round)
  //   - otherwise → thousands separator (strip it), parse as int
  const match = s.match(/(\d[\d\s.,]*)\s*(?:دج|da|dzd|د\.ج)?/i);
  if (!match?.[1]) return undefined;
  const raw = match[1].replace(/[\s]/g, ""); // strip spaces
  // Decimal comma: ",dd" at end (exactly 2 digits) → "." + dd
  const decimalCommaMatch = raw.match(/^(.*),(\d{2})$/);
  let num: number;
  if (decimalCommaMatch) {
    const intPart = decimalCommaMatch[1]!.replace(/[.,]/g, "");
    const fracPart = decimalCommaMatch[2]!;
    num = Math.round(parseFloat(`${intPart}.${fracPart}`));
  } else {
    // Thousands separator (comma or dot) → strip
    num = parseInt(raw.replace(/[.,]/g, ""), 10);
  }
  return isNaN(num) ? undefined : num;
}

function findWilaya(text: string): string | undefined {
  // AI-M9: word-boundary matching to avoid false positives.
  // Short wilaya names like "Mila" (wilaya 43), "Tébessa" (12), "Blida" (9)
  // were matching substrings of common words: "Mila" matched "familial",
  // "milieu", "Camila"; "Blida" matched "BlidaStreet" tags, etc.
  //
  // For each wilaya name, build a regex with word boundaries (\b) on both
  // sides. For Latin-script names this is straightforward. For Arabic names
  // we keep the plain includes() — Arabic script doesn't have the same
  // false-positive risk (it's not mixed with Latin word characters), and
  // \b doesn't behave reliably at Arabic/Latin boundaries.
  const lower = text.toLowerCase();
  for (const w of getWilayas()) {
    const nameLower = w.name.toLowerCase();
    // Escape regex metacharacters in the wilaya name (e.g. "M'Sila", "Aïn")
    const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word boundary on both sides — accented Latin chars are \w-equivalent
    // after lowercasing, so \b works for "Aïn Defla", "M'Sila", etc.
    const re = new RegExp(`(?:^|[^a-zà-ÿ])${escaped}(?:[^a-zà-ÿ]|$)`, "i");
    if (re.test(lower)) return w.name;
    if (text.includes(w.nameAr)) return w.name;
  }
  return undefined;
}

function findPhone(text: string): string | undefined {
  // AI-M10: handle the +213 international format in addition to the local
  // 0XXXXXXXXX format. Convert +213 → 0 so downstream storage + blind
  // indexes match across formats. Without this, "+213555123456" and
  // "0555123456" produced different customer rows (blind index mismatch).
  //
  // Patterns:
  //   1. +213 [5-7]XXXXXXXX  (international, optional spaces/dashes)
  //   2. 213 [5-7]XXXXXXXX   (international without +, rare but seen)
  //   3. 0[5-7]XXXXXXXX      (local — already handled)
  //   4. 0[5-7] XX XX XX XX  (local with spaces/dashes — already handled)

  // International +213 format (preferred when present)
  const intlMatch = text.match(/\+?213[\s-]?[5-7](?:[\s-]?\d){8}/);
  if (intlMatch) {
    const digits = intlMatch[0].replace(/\D/g, "");
    // digits = "2135XXXXXXXX" (12 digits) → strip leading "213", prepend "0"
    if (digits.length === 12 && digits.startsWith("213")) {
      return "0" + digits.slice(3);
    }
  }

  // Local 0XXXXXXXXX
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
  const pattern1 = /(\d+)\s*(?:x|×|fois|قطعة|حبة)\s+(.+?)\s+(\d[\d\s.,]*\s*(?:دج|da|dzd|د\.ج)?)(?:\s|$|,|;)/gi;
  while ((match = pattern1.exec(text)) !== null) {
    const quantity = parseInt(match[1] ?? "0", 10);
    const productName = (match[2] ?? "").trim();
    const unitPrice = parsePrice(match[3] ?? "");
    if (productName && quantity > 0) {
      items.push({ productName, quantity, unitPrice });
    }
  }

  // Pattern 1b (AI-M12): "product x2 [price]" — REVERSE pattern.
  // Algerian sellers very often write the product name FIRST, then the
  // quantity with an "x" prefix: "iPhone 14 x2", "casque bluetooth x3".
  // Pattern 1 above (qty-first) misses these. Run the same loop again
  // with the args in reverse order so both forms are recognized.
  const pattern1b = /(.+?)\s*(?:x|×)\s*(\d+)(?:\s+(\d[\d\s.,]*\s*(?:دج|da|dzd|د\.ج)?))?(?:\s|$|,|;)/gi;
  while ((match = pattern1b.exec(text)) !== null) {
    const productName = (match[1] ?? "").trim();
    const quantity = parseInt(match[2] ?? "0", 10);
    const unitPrice = match[3] ? parsePrice(match[3]) : undefined;
    // Quality filter: product name must have >= 3 word chars + not be a
    // pure number (avoids matching "8500 x2" as a product).
    if (productName.length < 3 || /^\d+$/.test(productName)) continue;
    // Avoid double-counting: skip if this product name was already matched
    // by pattern 1 (which captured a qty-first form for the same text span).
    if (items.some((i) => i.productName.toLowerCase() === productName.toLowerCase())) continue;
    if (quantity > 0) {
      items.push({ productName, quantity, unitPrice });
    }
  }

  // Pattern 2: "product price" (quantity = 1)
  // AI-M11: previously `(\d{3,6})` only matched plain 3-6 digit integers,
  // so "3,500 DA", "3.500 DA", and "3500,50 DA" all failed to match (or
  // matched partially — "3500,50" yielded 3500 instead of 3501). Broaden
  // the price capture to allow comma/dot thousands + comma decimals, then
  // parse via parsePrice (which disambiguates decimal vs thousands).
  if (items.length === 0) {
    const pattern2 = /([a-zA-Z\u0600-\u06FF][a-zA-Z0-9\u0600-\u06FF\s]{2,30}?)\s+(\d[\d.,]{2,}\d|\d{3,6})\s*(?:دج|da|dzd|د\.ج)?(?:\s|$|,|;)/gi;
    while ((match = pattern2.exec(text)) !== null) {
      const productName = (match[1] ?? "").trim();
      const unitPrice = parsePrice(match[2] ?? "");
      if (productName.length < 3) continue;
      if (unitPrice === undefined) continue;
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
