// ================================================
// AI Darija Order Extraction Engine
// Extracts structured order data from Algerian dialect messages
// ================================================

import type { AIExtraction } from "@/types/database";
import {
  FRANCO_ARAB_MAP,
  DARIJA_PRODUCT_KEYWORDS,
} from "@/lib/ai/prompts/algerian";
import { WILAYAS } from "@/lib/data/wilayas";

// ---- Wilaya Name Normalization ----

const WILAYA_ALIASES: Record<string, string> = {
  // French names
  alger: "Alger",
  algiers: "Alger",
  algers: "Alger",
  oran: "Oran",
  wahran: "Oran",
  constantine: "Constantine",
  qacentina: "Constantine",
  qsantina: "Constantine",
  annaba: "Annaba",
  "3annaba": "Annaba",
  blida: "Blida",
  "el blida": "Blida",
  setif: "Sétif",
  stif: "Sétif",
  setiff: "Sétif",
  batna: "Batna",
  djelfa: "Djelfa",
  jilfa: "Djelfa",
  "sidi bel abbes": "Sidi Bel Abbès",
  sba: "Sidi Bel Abbès",
  biskra: "Biskra",
  tebessa: "Tébessa",
  tbessa: "Tébessa",
  tiaret: "Tiaret",
  "tizi ouzou": "Tizi Ouzou",
  tizi: "Tizi Ouzou",
  bejaia: "Béjaïa",
  bgayet: "Béjaïa",
  bjaia: "Béjaïa",
  bouira: "Bouira",
  tlemcen: "Tlemcen",
  tilimsen: "Tlemcen",
  jijel: "Jijel",
  skikda: "Skikda",
  mostaganem: "Mostaganem",
  mostaghanem: "Mostaganem",
  msila: "M'sila",
  "m'sila": "M'sila",
  chlef: "Chlef",
  chelef: "Chlef",
  medea: "Médéa",
  mascara: "Mascara",
  ouargla: "Ouargla",
  wargla: "Ouargla",
  bechar: "Béchar",
  ghardaia: "Ghardaïa",
  ghardaya: "Ghardaïa",
  "el oued": "El Oued",
  "oued souf": "El Oued",
  boumerdes: "Boumerdès",
  tipaza: "Tipaza",
  tipasa: "Tipaza",
  "ain temouchent": "Aïn Témouchent",
  "ain defla": "Aïn Defla",
  relizane: "Relizane",
  "bordj bou arreridj": "Bordj Bou Arréridj",
  bba: "Bordj Bou Arréridj",
  khenchela: "Khenchela",
  "souk ahras": "Souk Ahras",
  mila: "Mila",
  naama: "Naâma",
  saida: "Saïda",
  adrar: "Adrar",
  tamanrasset: "Tamanrasset",
  tam: "Tamanrasset",
  laghouat: "Laghouat",
  "oum el bouaghi": "Oum El Bouaghi",
  "el bayadh": "El Bayadh",
  illizi: "Illizi",
  tindouf: "Tindouf",
  tissemsilt: "Tissemsilt",
  "el tarf": "El Tarf",
  "bab ezzouar": "Alger",
  "bab el oued": "Alger",
  "hussein dey": "Alger",
  kouba: "Alger",
  cheraga: "Alger",
  draria: "Alger",
  "es senia": "Oran",
};

// ---- Phone Number Extraction ----

function extractPhoneNumbers(text: string): string[] {
  const patterns = [
    /(?:0|\+213|00213)\s*[5-7]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/g,
    /(?:0|\+213|00213)\s*[5-7]\d{8}/g,
    /0[5-7]\d{8}/g,
  ];

  const phones = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const cleaned = match
          .replace(/[\s.-]/g, "")
          .replace(/^(\+213|00213)/, "0");
        if (cleaned.length === 10) phones.add(cleaned);
      }
    }
  }
  return Array.from(phones);
}

// ---- Name Extraction ----

function extractName(text: string): string | undefined {
  const namePatterns = [
    /(?:ismi|ismii|esmi|nom|name)[:\s]+([A-Za-zÀ-ÿ\u0600-\u06FF\s]{3,40})/i,
    /(?:ana|je\s+suis|my\s+name)[:\s]+([A-Za-zÀ-ÿ\u0600-\u06FF\s]{3,40})/i,
    /(?:إسمي|اسمي|سميتي)[:\s]+([A-Za-zÀ-ÿ\u0600-\u06FF\s]{3,40})/i,
  ];

  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      // Filter out common false positives
      if (name.length > 2 && !name.match(/^\d+$/)) {
        return name;
      }
    }
  }
  return undefined;
}

// ---- Wilaya Extraction ----

function extractWilaya(text: string): string | undefined {
  const normalizedText = text.toLowerCase();

  // Check for known wilayas/communes
  for (const [alias, wilaya] of Object.entries(WILAYA_ALIASES)) {
    const isWord = /^[a-z0-9]+$/i.test(alias);
    if (isWord) {
      const regex = new RegExp(`\\b${alias}\\b`, "i");
      if (regex.test(normalizedText)) {
        return wilaya;
      }
    } else {
      if (normalizedText.includes(alias)) {
        return wilaya;
      }
    }
  }

  // Check for wilaya number pattern (e.g., "wilaya 16" = Alger)
  const wilayaNumMatch = normalizedText.match(/wilaya\s*(\d{1,2})/);
  if (wilayaNumMatch) {
    const num = parseInt(wilayaNumMatch[1]);
    const wilaya = WILAYAS.find((w) => w.code === num);
    if (wilaya) return wilaya.name;
  }

  return undefined;
}

// ---- Product/Quantity Extraction ----

interface ProductMention {
  name: string;
  quantity: number;
  variant?: string;
}

function extractProducts(text: string): ProductMention[] {
  const _products: ProductMention[] = [];

  const colorPatterns: Record<string, string> = {
    noir: "Noir",
    noire: "Noir",
    black: "Noir",
    كحل: "Noir",
    أسود: "Noir",
    blanc: "Blanc",
    blanche: "Blanc",
    white: "Blanc",
    أبيض: "Blanc",
    بيضاء: "Blanc",
    rouge: "Rouge",
    red: "Rouge",
    أحمر: "Rouge",
    حمر: "Rouge",
    bleu: "Bleu",
    blue: "Bleu",
    أزرق: "Bleu",
    زرق: "Bleu",
    vert: "Vert",
    green: "Vert",
    أخضر: "Vert",
    خضر: "Vert",
    rose: "Rose",
    pink: "Rose",
    gris: "Gris",
    grey: "Gris",
    gray: "Gris",
    marron: "Marron",
    brown: "Marron",
    beige: "Beige",
  };

  const qtyPatterns = [
    /(\d+)\s*(?:pièces?|pieces?|pc|حبات?|حبة|قطعة|قطع)/gi,
    /(?:bghit|nabghi|je\s+veux|send)\s*(\d+)/gi,
    /(\d+)\s+(?:de|du|des|d'|dial|dyal|ديال)/gi,
  ];

  const lowerText = text.toLowerCase();

  // Find all matches of product keywords
  const matchedKeywords: { index: number; length: number; standard: string }[] = [];
  for (const [darija, standard] of Object.entries(DARIJA_PRODUCT_KEYWORDS)) {
    const regex = new RegExp(`\\b${darija}\\b`, "gi");
    let match;
    while ((match = regex.exec(lowerText)) !== null) {
      matchedKeywords.push({
        index: match.index,
        length: match[0].length,
        standard,
      });
    }
  }

  // Sort by index
  matchedKeywords.sort((a, b) => a.index - b.index);

  if (matchedKeywords.length === 0) {
    // Fallback: search for quantity/variant globally
    let totalQty = 1;
    for (const pattern of qtyPatterns) {
      const match = text.match(pattern);
      if (match) {
        const num = parseInt(match[0].match(/\d+/)?.[0] || "1");
        if (num > 0 && num < 100) totalQty = num;
      }
    }
    const sizeMatch = text.match(
      /(?:taille|size|مقاس)\s*(XS|S|M|L|XL|XXL|XXXL|\d{2})/i,
    );
    const size = sizeMatch ? sizeMatch[1].toUpperCase() : undefined;
    let color: string | undefined;
    for (const [key, value] of Object.entries(colorPatterns)) {
      if (lowerText.includes(key)) {
        color = value;
        break;
      }
    }
    const variant = [size, color].filter(Boolean).join(" / ") || undefined;
    if (totalQty > 1 || variant) {
      return [{ name: "", quantity: totalQty, variant }];
    }
    return [];
  }

  // Segment the text
  const segments: { text: string; standard: string }[] = [];
  for (let i = 0; i < matchedKeywords.length; i++) {
    const current = matchedKeywords[i];
    let start = 0;
    let end = text.length;

    if (i > 0) {
      const prev = matchedKeywords[i - 1];
      start = Math.floor((prev.index + prev.length + current.index) / 2);
    }
    if (i < matchedKeywords.length - 1) {
      const next = matchedKeywords[i + 1];
      end = Math.floor((current.index + current.length + next.index) / 2);
    }

    segments.push({
      text: text.slice(start, end),
      standard: current.standard,
    });
  }

  // Parse quantity and variant for each segment
  const uniqueProducts = new Map<string, ProductMention>();

  for (const seg of segments) {
    const segText = seg.text;
    const segLower = segText.toLowerCase();

    let qty = 1;
    for (const pattern of qtyPatterns) {
      const match = segText.match(pattern);
      if (match) {
        const num = parseInt(match[0].match(/\d+/)?.[0] || "1");
        if (num > 0 && num < 100) {
          qty = num;
          break;
        }
      }
    }
    if (qty === 1) {
      const simpleNumMatch = segText.match(/\b([1-9])\b/);
      if (simpleNumMatch) {
        qty = parseInt(simpleNumMatch[1]);
      }
    }

    const sizeMatch = segText.match(
      /(?:taille|size|مقاس)\s*(XS|S|M|L|XL|XXL|XXXL|\d{2})/i,
    );
    const size = sizeMatch ? sizeMatch[1].toUpperCase() : undefined;

    let color: string | undefined;
    for (const [key, value] of Object.entries(colorPatterns)) {
      if (segLower.includes(key)) {
        color = value;
        break;
      }
    }

    const variant = [size, color].filter(Boolean).join(" / ") || undefined;
    const key = `${seg.standard}::${variant || ""}`;

    if (uniqueProducts.has(key)) {
      uniqueProducts.get(key)!.quantity += qty;
    } else {
      uniqueProducts.set(key, {
        name: seg.standard,
        quantity: qty,
        variant,
      });
    }
  }

  return Array.from(uniqueProducts.values());
}

// ---- Address Extraction ----

function extractAddress(text: string): string | undefined {
  // Look for address-like patterns
  const addressPatterns = [
    /(?:adresse|address|عنوان)[:\s]+(.{10,100})/i,
    /(?:centre|cité|hai|حي|شارع|rue)\s+[A-Za-zÀ-ÿ\u0600-\u06FF\s]{3,50}/i,
  ];

  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) return match[1]?.trim() || match[0]?.trim();
  }

  return undefined;
}

import { callLLMJson } from "../agents/groq";
import { getAlgerianLanguagePrompt } from "./prompts/algerian";

/**
 * Extract structured order data from a conversation (array of message texts).
 * Uses Groq LLM for context-aware extraction of Darija/Franco-Arab nuances.
 */
export async function extractOrderFromMessages(
  messages: string[],
): Promise<AIExtraction> {
  return extractOrderWithCatalog(messages, []);
}

export async function extractOrderWithCatalog(
  messages: string[],
  catalog: Array<{
    id: string;
    name: string;
    price: number;
    variants?: unknown[];
  }>,
): Promise<AIExtraction> {
  const allText = messages.join("\n");

  // Fallback fast regex extractor for simple cases to boost base confidence
  const basicPhones = extractPhoneNumbers(allText);
  const basicWilaya = extractWilaya(allText);

  const catalogContext =
    catalog.length > 0
      ? `\nAVAILABLE PRODUCT CATALOG TO MATCH AGAINST (Use exact names/prices if they refer to these):\n${JSON.stringify(catalog, null, 2)}`
      : "";

  const prompt = `You are an expert Algerian e-commerce data extraction AI.
${getAlgerianLanguagePrompt()}

Your task is to extract user order information from the provided messages.
Messages:
"""
${allText}
"""${catalogContext}

Output valid JSON exclusively matching this structure:
{
  "customer_name": "string or null",
  "phone": "string (10 digits) or null",
  "wilaya": "string (Official French name, e.g. 'Alger', 'Oran') or null",
  "commune": "string or null (city/town inside the wilaya)",
  "address": "string or null (street, building, bloc, cite, hai)",
  "products": [
    { "name": "string (match catalog if possible)", "quantity": number, "variant": "string (size/color) or null" }
  ],
  "confidence": number (0.0 to 1.0)
}

Rules:
1. Translate Darija/Franco-Arab locations to official Wilaya names (e.g. 'bgayet' -> 'Béjaïa').
2. Identify "commune" separate from wilaya (if they say "Bir El Djir, Oran", wilaya=Oran, commune=Bir El Djir).
3. Be smart about Darija address words: "cite", "bloc", "batiment", "haya", "coopérative".
4. Normalize phone numbers to 10 digits starting with 0.
5. If information is missing, use null or empty array.
6. Base confidence on how complete and clear the address/phone/product details are.
`;

  try {
    const aiResult = await callLLMJson<{
      customer_name: string | null;
      phone: string | null;
      wilaya: string | null;
      commune: string | null;
      address: string | null;
      products: { name: string; quantity: number; variant?: string | null }[];
      confidence: number;
    }>([{ role: "system", content: prompt }], { temperature: 0.1 });

    return {
      customer_name: aiResult.customer_name || extractName(allText),
      phone: aiResult.phone || basicPhones[0],
      wilaya: aiResult.wilaya || basicWilaya,
      commune: aiResult.commune || undefined,
      address: aiResult.address || extractAddress(allText),
      products:
        aiResult.products && aiResult.products.length > 0
          ? aiResult.products.map(
              (p: {
                name: string;
                quantity: number;
                variant?: string | null;
              }) => {
                const matched = catalog.find(
                  (c) => c.name.toLowerCase() === p.name.toLowerCase(),
                );
                return {
                  name: p.name,
                  quantity: p.quantity,
                  price: matched ? matched.price : undefined,
                  product_id: matched ? matched.id : undefined,
                  variant: p.variant || undefined,
                };
              },
            )
          : extractProducts(allText),
      confidence: aiResult.confidence ?? 0.5,
      raw_text: allText,
    };
  } catch (err) {
    console.warn("LLM Extraction failed, falling back to Regex:", err);

    // Strict Regex Fallback
    const name = extractName(allText);
    const address = extractAddress(allText);
    const products = extractProducts(allText);

    let confidence = 0;
    if (name) confidence += 0.2;
    if (basicPhones.length > 0) confidence += 0.25;
    if (basicWilaya) confidence += 0.25;
    if (products.length > 0 && products[0].quantity > 0) confidence += 0.2;
    if (address) confidence += 0.1;

    return {
      customer_name: name,
      phone: basicPhones[0],
      wilaya: basicWilaya,
      commune: undefined,
      address,
      products,
      confidence: Math.round(confidence * 100) / 100,
      raw_text: allText,
    };
  }
}

/**
 * Extract from a single message text
 */
export async function extractOrderFromSingleMessage(
  text: string,
): Promise<AIExtraction> {
  return extractOrderFromMessages([text]);
}

// ---- Product Fuzzy Matching ----

/**
 * Normalize Arabic tashkeel, Franco-Arab numerals, and lowercases
 */
function normalizeDarija(text: string): string {
  const s = text
    .normalize("NFD")
    // Remove Arabic tashkeel (diacritics)
    .replace(/[\u064B-\u0652]/g, "")
    // Replace Franco-Arab numerals with Arabic letters ONLY if adjacent to letters (avoids phone number/product number corruption)
    .replace(
      /(?<!\d)(?<=[a-zA-Z])[379582](?!\d)|(?<!\d)[379582](?=[a-zA-Z])(?!\d)/g,
      (m) => FRANCO_ARAB_MAP[m] || m,
    )
    .toLowerCase()
    .trim();
  return s;
}

function normalizeProductString(str: string): string {
  let s = str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064B-\u0652]/g, "")
    .trim();

  // Apply Darija keyword mapping (from prompts/algerian.ts)
  for (const [darija, standard] of Object.entries(DARIJA_PRODUCT_KEYWORDS)) {
    s = s.replace(new RegExp(darija, "gi"), standard);
  }

  return s;
}

export function matchProductToCatalog(
  mention: string,
  catalog: { id: string; name: string; price: number; sku?: string | null }[],
): { id: string; name: string; price: number } | null {
  if (!mention || catalog.length === 0) return null;

  const normalizedMention = normalizeDarija(normalizeProductString(mention));
  if (!normalizedMention) return null;

  const mentionWords = normalizedMention.split(/\s+/).filter(Boolean);

  let bestMatch: { id: string; name: string; price: number } | null = null;
  let bestScore = 0;

  for (const product of catalog) {
    const normalizedProduct = normalizeDarija(
      normalizeProductString(product.name),
    );
    if (!normalizedProduct) continue;

    // Exact substring match
    if (
      normalizedProduct.includes(normalizedMention) ||
      normalizedMention.includes(normalizedProduct)
    ) {
      return { id: product.id, name: product.name, price: product.price };
    }

    // Word overlap similarity
    const productWords = normalizedProduct.split(/\s+/).filter(Boolean);
    const matchingWords = mentionWords.filter((w) =>
      productWords.some((pw) => pw.includes(w) || w.includes(pw)),
    );
    const score =
      mentionWords.length > 0 ? matchingWords.length / mentionWords.length : 0;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { id: product.id, name: product.name, price: product.price };
    }
  }

  // Require at least 50% word match
  if (bestScore >= 0.5) return bestMatch;
  return null;
}
