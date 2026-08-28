/**
 * FRC-2 frozen order-extraction corpus — synthetic/redacted, versioned.
 *
 * WHAT THIS IS
 * The FRC-2 contract (documentation/operations/WORKFLOW.md §10, ROADMAP "FRC-2")
 * requires a frozen synthetic/redacted AR/FR/EN/Darija/mixed order corpus before
 * execution. This module is that corpus: a deterministic, reviewable baseline of
 * Algerian COD message shapes with the extraction expectations that the current
 * regex extractor and the Gemini path must each satisfy.
 *
 * PROVENANCE
 * - Every message is synthetic. No real customer message, name, address or
 *   phone number is included.
 * - Every phone number uses the reserved-shape family `0[5-7]0 00 00 XX`
 *   (normalized `0[5-7]000000XX`). The third digit `0` is not a valid Algerian
 *   mobile operator prefix (055-059/066-069/077-079 are real; 050/060/070 are
 *   not), so no corpus number can collide with a real subscriber.
 * - Customer names are generic first names already used across the test suite.
 *
 * FREEZE RULES
 * - `regex` expectations are the OBSERVED behavior of `extractWithRegex` at
 *   freeze time (including known quality gaps such as phone-like tails parsed
 *   as phantom unit prices). They are a regression baseline, not an ideal.
 * - `gemini` expectations are the canonical JSON a correct model must return
 *   under `EXTRACTION_SYSTEM_PROMPT`; every one must validate under
 *   `ExtractedOrderSchema` (schema/parity drift guard).
 * - Confidence is asserted with `minConfidence` because the extractor's score
 *   is a floating-point sum (0.6000000000000001 is a legitimate 0.6).
 * - Changing extractor behavior intentionally requires updating the frozen
 *   expectation AND the note explaining the new truth in the same commit.
 */

import type { ExtractionInput } from "../types";

export const CORPUS_VERSION = "frc2-1.0.0";
export const CORPUS_FREEZE_DATE = "2026-08-28";

/** Phone numbers inside corpus messages must normalize into this family. */
export const SYNTHETIC_PHONE_PATTERN = /^0[5-7]0{6}\d{2}$/;

export type CorpusLanguage = "ar" | "arabizi" | "fr" | "en" | "mixed";

export type CorpusCategory =
  | "complete"
  | "missing-field"
  | "ambiguity-noise"
  | "quantity-form"
  | "price-format"
  | "phone-format"
  | "multi-item"
  | "known-phone"
  | "name-gap"
  | "wilaya-number"
  | "gemini-complement";

/** Loose per-item expectation: exact name, contained name, quantity, price. */
export interface CorpusItemExpectation {
  /** Exact observed/expected productName. */
  productName?: string;
  /** Case-insensitive containment alternative to `productName`. */
  productNameContains?: string;
  quantity?: number;
  unitPrice?: number;
}

/** Subset expectation against an ExtractedOrder. `null` field = must be absent. */
export interface CorpusOrderExpectation {
  customerName?: string | null;
  phone?: string;
  wilaya?: string;
  items?: CorpusItemExpectation[];
}

export interface CorpusRegexExpectation {
  /** null = extractor must return order === null (method "none"). */
  order: CorpusOrderExpectation | null;
  isComplete?: boolean;
  missingFields?: string[];
  minConfidence?: number;
}

/** Canonical JSON a correct Gemini response must carry for this message. */
export interface CorpusGeminiExpectation {
  order: Record<string, unknown>;
}

export interface ExtractionCorpusCase {
  id: string;
  language: CorpusLanguage;
  category: CorpusCategory;
  /** Human explanation of what the case exercises/freezes. */
  note?: string;
  message: string;
  knownPhone?: string;
  regex?: CorpusRegexExpectation;
  gemini?: CorpusGeminiExpectation;
}

export const EXTRACTION_CORPUS: readonly ExtractionCorpusCase[] = [
  // ─── Arabic script (ar) ────────────────────────────────────────────────────
  {
    id: "AR-001",
    language: "ar",
    category: "complete",
    note: "Full Arabic-script order; freezes observed product-name capture that spans the Arabic comma.",
    message: "اسمي Ahmed، بغيت نشرى iPhone 14 ب 8500 دج ف الجزائر، رقمي 05 00 00 00 01",
    regex: {
      order: {
        customerName: "Ahmed",
        phone: "0500000001",
        wilaya: "Alger",
        items: [{ productName: "مي Ahmed، بغيت نشرى iPhone 14 ب", quantity: 1, unitPrice: 8500 }],
      },
      isComplete: true,
      minConfidence: 0.99,
    },
  },
  {
    id: "AR-002",
    language: "ar",
    category: "missing-field",
    note: "Arabic-Indic digits normalize; 'للجزائر' does not contain the nameAr 'الجزائر' so wilaya stays missing for regex (Gemini resolves it).",
    message: "السلام عليكم، نحب نطلب ١ كيلو عسل طبيعي بـ ٢٥٠٠ دج، التوصيل للجزائر، الهاتف: ٠٥٠٠٠٠٠٠٠٢",
    regex: {
      order: {
        customerName: null,
        phone: "0500000002",
        items: [{ productName: "م، نحب نطلب 1 كيلو عسل طبيعي بـ", quantity: 1, unitPrice: 2500 }],
      },
      isComplete: false,
      missingFields: ["wilaya"],
      minConfidence: 0.6,
    },
    gemini: {
      order: { phone: "0500000002", wilaya: "Alger", items: [{ productName: "عسل طبيعي", quantity: 1, unitPrice: 2500 }] },
    },
  },
  {
    id: "AR-003",
    language: "ar",
    category: "quantity-form",
    note: "'2 قطعة' quantity separator with Arabic-Indic phone digits.",
    message: "بغيت 2 قطعة montre ب 3500 دج التوصيل لوهران ٠٥٠٠٠٠٠٠٠٣",
    regex: {
      order: {
        customerName: null,
        phone: "0500000003",
        wilaya: "Oran",
        items: [{ productName: "montre ب", quantity: 2, unitPrice: 3500 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "AR-004",
    language: "ar",
    category: "missing-field",
    note: "Arabic-script product with wilaya but no phone — partial regex result must survive (manual fallback path).",
    message: "بغيت نشرى casque bluetooth ب 2500 دج وهران",
    regex: {
      order: {
        customerName: null,
        wilaya: "Oran",
        items: [{ productName: "بغيت نشرى casque bluetooth ب", quantity: 1, unitPrice: 2500 }],
      },
      isComplete: false,
      missingFields: ["phone"],
      minConfidence: 0.65,
    },
  },
  {
    id: "AR-005",
    language: "ar",
    category: "missing-field",
    note: "Clean x-notation item with Arabic name intro; wilaya missing.",
    message: "اسمي Sara، 2x montre 4000 دج، 0500000005",
    regex: {
      order: {
        customerName: "Sara",
        phone: "0500000005",
        items: [{ productName: "montre", quantity: 2, unitPrice: 4000 }],
      },
      isComplete: false,
      missingFields: ["wilaya"],
      minConfidence: 0.75,
    },
  },
  {
    id: "AR-006",
    language: "ar",
    category: "ambiguity-noise",
    note: "Arabic chat is not an order.",
    message: "سلام شحالك خويا، باقي ما وصلني شي",
    regex: { order: null, isComplete: false, missingFields: ["items", "wilaya", "phone"], minConfidence: 0 },
  },
  {
    id: "AR-007",
    language: "ar",
    category: "phone-format",
    note: "International +213 spaced phone normalizes to the 0-family; freezes product-name capture spanning the Arabic comma.",
    message: "التوصيل لقسنطينة، iPhone 13 ب 98000 دج، +213 500 00 00 07",
    regex: {
      order: {
        customerName: null,
        phone: "0500000007",
        wilaya: "Constantine",
        items: [{ productName: "التوصيل لقسنطينة، iPhone 13 ب", quantity: 1, unitPrice: 98000 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "AR-009",
    language: "ar",
    category: "wilaya-number",
    note: "Wilaya NUMBERS ('٣١') are Gemini prompt authority; regex cannot map them. Canonical Gemini answer is Oran.",
    message: "٣ قطعة كريم البشرة، ٢٠٠٠ دج للقطعة، ولاية ٣١، ٠٥٠٠٠٠٠٠٠٩",
    regex: {
      order: {
        customerName: null,
        phone: "0500000009",
        items: [{ productName: "كريم البشرة،", quantity: 3, unitPrice: 2000 }],
      },
      isComplete: false,
      missingFields: ["wilaya"],
      minConfidence: 0.6,
    },
    gemini: {
      order: { phone: "0500000009", wilaya: "Oran", items: [{ productName: "كريم البشرة", quantity: 3, unitPrice: 2000 }] },
    },
  },

  // ─── Arabizi / Darija in Latin script (arabizi) ────────────────────────────
  {
    id: "DZ-001",
    language: "arabizi",
    category: "ambiguity-noise",
    note: "Two wilaya mentions: regex list-order picks Blida (earlier in wilayas.json) over Alger; Gemini resolves the delivery wilaya. Known limitation, frozen.",
    message: "salam, nheb nchri 2 casques bluetooth w tal3a 3500 da lwilaya 16 alger, blida ykon fiha stock?",
    regex: {
      order: {
        customerName: null,
        wilaya: "Blida",
        items: [{ productName: "hri 2 casques bluetooth w tal3a", quantity: 1, unitPrice: 3500 }],
      },
      isComplete: false,
      missingFields: ["phone"],
      minConfidence: 0.65,
    },
    gemini: {
      order: { items: [{ productName: "casques bluetooth", quantity: 2, unitPrice: 3500 }], wilaya: "Alger" },
    },
  },
  {
    id: "DZ-002",
    language: "arabizi",
    category: "complete",
    note: "Clean qty-first x-notation Darija order.",
    message: "khasni 2x casque gaming 4500 dz Oran, ttl 0500000012",
    regex: {
      order: {
        customerName: null,
        phone: "0500000012",
        wilaya: "Oran",
        items: [{ productName: "casque gaming", quantity: 2, unitPrice: 4500 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "DZ-003",
    language: "arabizi",
    category: "quantity-form",
    note: "Product-first 'x3' reverse pattern with spaced local phone.",
    message: "casque bluetooth x3 2500 da Oran, 05 00 00 00 13",
    regex: {
      order: {
        customerName: null,
        phone: "0500000013",
        wilaya: "Oran",
        items: [{ productName: "casque bluetooth", quantity: 3, unitPrice: 2500 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "DZ-004",
    language: "arabizi",
    category: "complete",
    note: "French name intro with full fields.",
    message: "Je m'appelle Karim, je veux commander iPhone 14 8500 DA a Annaba, 0500000014",
    regex: {
      order: {
        customerName: "Karim",
        phone: "0500000014",
        wilaya: "Annaba",
        items: [{ productName: "je veux commander iPhone 14", quantity: 1, unitPrice: 8500 }],
      },
      isComplete: true,
      minConfidence: 0.99,
    },
  },
  {
    id: "DZ-005",
    language: "arabizi",
    category: "multi-item",
    note: "Known gap: trailing 'mon num 0500000015' is parsed as a phantom item with unitPrice 500000015; canonical review catches it.",
    message: "ana Amina, nheb nchri tshirt rouge w jean 4000, tshirts 1500 le koll, tawsil l'annaba, mon num 0500000015",
    regex: {
      order: {
        customerName: "Amina",
        phone: "0500000015",
        wilaya: "Annaba",
        items: [
          { productName: "nheb nchri tshirt rouge w jean", quantity: 1, unitPrice: 4000 },
          { productName: "tshirts", quantity: 1, unitPrice: 1500 },
          { productName: "mon num", quantity: 1, unitPrice: 500000015 },
        ],
      },
      isComplete: true,
      minConfidence: 0.99,
    },
  },
  {
    id: "DZ-006",
    language: "arabizi",
    category: "ambiguity-noise",
    note: "Product intent without any structured field — manual fallback territory.",
    message: "khasni wahda chargeur",
    regex: { order: null, isComplete: false, missingFields: ["items", "wilaya", "phone"], minConfidence: 0 },
  },
  {
    id: "DZ-007",
    language: "arabizi",
    category: "multi-item",
    note: "Two clean x-notation items with a total prefix line.",
    message: "salam, total 9500 da: 2x montre 3500 w 2x casque 1250, livraison Batna, 0500000017",
    regex: {
      order: {
        customerName: null,
        phone: "0500000017",
        wilaya: "Batna",
        items: [
          { productName: "montre", quantity: 2, unitPrice: 3500 },
          { productName: "casque", quantity: 2, unitPrice: 1250 },
        ],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "DZ-008",
    language: "arabizi",
    category: "ambiguity-noise",
    note: "Pure greeting.",
    message: "salam khoya kifash dayrin?",
    regex: { order: null, isComplete: false, missingFields: ["items", "wilaya", "phone"], minConfidence: 0 },
  },
  {
    id: "DZ-009",
    language: "arabizi",
    category: "known-phone",
    note: "knownPhone fallback completes the order when the message has no number.",
    message: "bghit 2x écouteurs JBL 9000 da Blida",
    knownPhone: "0500000019",
    regex: {
      order: {
        customerName: null,
        phone: "0500000019",
        wilaya: "Blida",
        items: [{ productName: "écouteurs JBL", quantity: 2, unitPrice: 9000 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },

  // ─── French (fr) ───────────────────────────────────────────────────────────
  {
    id: "FR-001",
    language: "fr",
    category: "missing-field",
    note: "Accented 'écouteurs' start is outside the extractor's product-name class, hence 'couteurs JBL'; phone missing.",
    message: "Je veux commander 2 écouteurs JBL 9000 DA, Oran",
    regex: {
      order: {
        customerName: null,
        wilaya: "Oran",
        items: [{ productName: "couteurs JBL", quantity: 1, unitPrice: 9000 }],
      },
      isComplete: false,
      missingFields: ["phone"],
      minConfidence: 0.65,
    },
  },
  {
    id: "FR-002",
    language: "fr",
    category: "complete",
    note: "Spaced local phone with accented wilaya Sétif.",
    message: "Bonjour, commande pour Sétif, 05 00 00 00 21, iPhone 14 85000 DA",
    regex: {
      order: {
        customerName: null,
        phone: "0500000021",
        wilaya: "Sétif",
        items: [{ productName: "iPhone 14", quantity: 1, unitPrice: 85000 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "FR-003",
    language: "fr",
    category: "quantity-form",
    note: "'3x' quantity-first notation.",
    message: "3x basket sport 6500 DA Constantine, tel 0500000022",
    regex: {
      order: {
        customerName: null,
        phone: "0500000022",
        wilaya: "Constantine",
        items: [{ productName: "basket sport", quantity: 3, unitPrice: 6500 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "FR-004",
    language: "fr",
    category: "phone-format",
    note: "International +213 spaced form inside a French delivery line.",
    message: "Livraison Oran, +213 500 00 00 23, casque 3000 DA",
    regex: {
      order: {
        customerName: null,
        phone: "0500000023",
        wilaya: "Oran",
        items: [{ productName: "casque", quantity: 1, unitPrice: 3000 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "FR-005",
    language: "fr",
    category: "price-format",
    note: "Decimal comma '3500,50' rounds to 3501 (DZD has no COD sub-unit).",
    message: "iPhone 14 3500,50 DA Alger",
    regex: {
      order: {
        customerName: null,
        wilaya: "Alger",
        items: [{ productName: "iPhone 14", quantity: 1, unitPrice: 3501 }],
      },
      isComplete: false,
      missingFields: ["phone"],
      minConfidence: 0.65,
    },
  },
  {
    id: "FR-006",
    language: "fr",
    category: "price-format",
    note: "Comma thousands '3,500' parses as 3500.",
    message: "iPhone 14 3,500 DA Alger, 0500000026",
    regex: {
      order: {
        customerName: null,
        phone: "0500000026",
        wilaya: "Alger",
        items: [{ productName: "iPhone 14", quantity: 1, unitPrice: 3500 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "FR-007",
    language: "fr",
    category: "ambiguity-noise",
    note: "French smalltalk is not an order.",
    message: "Bonjour, comment ça va?",
    regex: { order: null, isComplete: false, missingFields: ["items", "wilaya", "phone"], minConfidence: 0 },
  },

  // ─── English (en) ──────────────────────────────────────────────────────────
  {
    id: "EN-001",
    language: "en",
    category: "complete",
    note: "Straight English COD order.",
    message: "I want to order 2x wireless mouse 2500 DA, delivery to Alger, 0500000031",
    regex: {
      order: {
        customerName: null,
        phone: "0500000031",
        wilaya: "Alger",
        items: [{ productName: "wireless mouse", quantity: 2, unitPrice: 2500 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "EN-002",
    language: "en",
    category: "name-gap",
    note: "'My name is' is not among the regex name intros — customerName stays absent (Gemini closes the gap).",
    message: "My name is Sara, 2x hoodie 3200 DA Oran 0500000032",
    regex: {
      order: {
        customerName: null,
        phone: "0500000032",
        wilaya: "Oran",
        items: [{ productName: "hoodie", quantity: 2, unitPrice: 3200 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
    gemini: {
      order: { customerName: "Sara", phone: "0500000032", wilaya: "Oran", items: [{ productName: "hoodie", quantity: 2, unitPrice: 3200 }] },
    },
  },
  {
    id: "EN-003",
    language: "en",
    category: "ambiguity-noise",
    note: "Delivery-area question: wilaya matches but no order exists.",
    message: "Do you deliver to Ouargla?",
    regex: { order: null, isComplete: false, missingFields: ["items", "phone"], minConfidence: 0.25 },
  },
  {
    id: "EN-004",
    language: "en",
    category: "complete",
    note: "Non-ASCII wilaya Ghardaïa with 'dz' price suffix.",
    message: "2x gaming keyboard 4800 dz Ghardaïa, 0500000034",
    regex: {
      order: {
        customerName: null,
        phone: "0500000034",
        wilaya: "Ghardaïa",
        items: [{ productName: "gaming keyboard", quantity: 2, unitPrice: 4800 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },

  // ─── Mixed AR/Latin/FR code-switching (mixed) ──────────────────────────────
  {
    id: "MX-001",
    language: "mixed",
    category: "phone-format",
    note: "Arabic intent + Latin product; phone tail becomes a phantom second item — frozen known gap, canonical review handles it.",
    message: "سلام بغيت iPhone 14 ب 8500 دج التوصيل لوهران 0500000041",
    regex: {
      order: {
        customerName: null,
        phone: "0500000041",
        wilaya: "Oran",
        items: [
          { productName: "سلام بغيت iPhone 14 ب", quantity: 1, unitPrice: 8500 },
          { productName: "التوصيل لوهران", quantity: 1, unitPrice: 500000041 },
        ],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
    gemini: {
      order: { phone: "0500000041", wilaya: "Oran", items: [{ productName: "iPhone 14", quantity: 1, unitPrice: 8500 }] },
    },
  },
  {
    id: "MX-002",
    language: "mixed",
    category: "complete",
    note: "Arabizi intent + Arabic currency suffix; phantom delivery item frozen (same tail gap).",
    message: "salam nheb casque bluetooth 2500 دج livraison Oran 0500000042",
    regex: {
      order: {
        customerName: null,
        phone: "0500000042",
        wilaya: "Oran",
        items: [
          { productName: "salam nheb casque bluetooth", quantity: 1, unitPrice: 2500 },
          { productName: "livraison Oran", quantity: 1, unitPrice: 500000042 },
        ],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
    gemini: {
      order: { phone: "0500000042", wilaya: "Oran", items: [{ productName: "casque bluetooth", quantity: 1, unitPrice: 2500 }] },
    },
  },
  {
    id: "MX-003",
    language: "mixed",
    category: "phone-format",
    note: "Arabic wilaya name 'تيزي وزو' resolves Tizi Ouzou; accented product start truncates.",
    message: "بغيت نشرى écouteurs JBL ب 9000 دج ف تيزي وزو 0500000043",
    regex: {
      order: {
        customerName: null,
        phone: "0500000043",
        wilaya: "Tizi Ouzou",
        items: [
          { productNameContains: "couteurs JBL", quantity: 1, unitPrice: 9000 },
          { productName: "\u0641 \u062a\u064a\u0632\u064a \u0648\u0632\u0648", quantity: 1, unitPrice: 500000043 },
        ],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "MX-004",
    language: "mixed",
    category: "multi-item",
    note: "Without x-notation the first item ('2 écouteurs') is lost once pattern1 matches the second — frozen gap favoring Gemini.",
    message: "٢ écouteurs w 3x chargeur, 4500 da koll wahda, Ouargla, 0500000044",
    regex: {
      order: {
        customerName: null,
        phone: "0500000044",
        wilaya: "Ouargla",
        items: [{ productName: "chargeur,", quantity: 3, unitPrice: 4500 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
    gemini: {
      order: {
        phone: "0500000044",
        wilaya: "Ouargla",
        items: [
          { productName: "écouteurs", quantity: 2 },
          { productName: "chargeur", quantity: 3, unitPrice: 4500 },
        ],
      },
    },
  },
  {
    id: "MX-005",
    language: "mixed",
    category: "complete",
    note: "Emoji decoration does not break extraction.",
    message: "🔥 salam, nchri 2x montre 3000 da 🙏 Annaba 0500000045",
    regex: {
      order: {
        customerName: null,
        phone: "0500000045",
        wilaya: "Annaba",
        items: [{ productName: "montre", quantity: 2, unitPrice: 3000 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "MX-006",
    language: "mixed",
    category: "complete",
    note: "Newline-separated message normalizes to single spaces.",
    message: "salam\nnheb 2x casque gaming 4500 da\nlivraison Constantine\n0500000046",
    regex: {
      order: {
        customerName: null,
        phone: "0500000046",
        wilaya: "Constantine",
        items: [{ productName: "casque gaming", quantity: 2, unitPrice: 4500 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },
  {
    id: "MX-007",
    language: "mixed",
    category: "ambiguity-noise",
    note: "AI-M9 word-boundary guard: 'Mila' must not match inside 'familial'; Alger wins.",
    message: "contexte familial, bpc 12 alger, 2x chargeur 1500 da",
    regex: {
      order: {
        customerName: null,
        wilaya: "Alger",
        items: [{ productName: "chargeur", quantity: 2, unitPrice: 1500 }],
      },
      isComplete: false,
      missingFields: ["phone"],
      minConfidence: 0.65,
    },
  },
  {
    id: "MX-008",
    language: "mixed",
    category: "quantity-form",
    note: "Uppercase '2X' and uppercase product/wilaya survive case-insensitive matching.",
    message: "2X CASQUE BLUETOOTH 4500 DA ORAN 0500000047",
    regex: {
      order: {
        customerName: null,
        phone: "0500000047",
        wilaya: "Oran",
        items: [{ productName: "CASQUE BLUETOOTH", quantity: 2, unitPrice: 4500 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
  },

  // ─── Gemini-complement (regex cannot; canonical Gemini answers frozen) ─────
  {
    id: "GE-002",
    language: "mixed",
    category: "gemini-complement",
    note: "Exchange order with notes: regex returns none (product span too long, comma before price); Gemini path is required.",
    message: "salam, nheb nbedel casque dyali b casque bluetooth jdid, 4500 da, Constantine, 0500000052",
    regex: {
      order: null,
      isComplete: false,
      missingFields: ["items"],
      minConfidence: 0.45,
    },
    gemini: {
      order: {
        phone: "0500000052",
        wilaya: "Constantine",
        items: [{ productName: "casque bluetooth", quantity: 1, unitPrice: 4500 }],
        notes: "échange (بدل) — client remplace un ancien casque",
      },
    },
  },
  {
    id: "GE-003",
    language: "arabizi",
    category: "gemini-complement",
    note: "Multi-item with per-unit pricing, address and total: regex yields a partial noisy basket, Gemini the canonical order.",
    message: "ahla, ana Karim, nheb 2 tshirts w 1 jean, tshirts 1500 le koll w jean 4000, tawsil l'annaba, cité 400 logts bat 9, mon num 0500000053",
    regex: {
      order: {
        customerName: "Karim",
        phone: "0500000053",
        wilaya: "Annaba",
        items: [
          { productName: "tshirts", quantity: 1, unitPrice: 1500 },
          { productName: "le koll w jean", quantity: 1, unitPrice: 4000 },
          { productName: "mon num", quantity: 1, unitPrice: 500000053 },
        ],
      },
      isComplete: true,
      minConfidence: 0.99,
    },
    gemini: {
      order: {
        customerName: "Karim",
        phone: "0500000053",
        wilaya: "Annaba",
        address: "cité 400 logts bat 9",
        items: [
          { productName: "tshirts", quantity: 2, unitPrice: 1500 },
          { productName: "jean", quantity: 1, unitPrice: 4000 },
        ],
        totalPrice: 7000,
      },
    },
  },
  {
    id: "GE-004",
    language: "arabizi",
    category: "gemini-complement",
    note: "Darija number words ('khamsa alaf' = 5000) are prompt authority; regex parses only a phantom tail item.",
    message: "nheb nchri parfum, thmano khamsa alaf, livraison l'Oran, num 0500000054",
    regex: {
      order: {
        customerName: null,
        phone: "0500000054",
        wilaya: "Oran",
        items: [{ productName: "num", quantity: 1, unitPrice: 500000054 }],
      },
      isComplete: true,
      minConfidence: 0.85,
    },
    gemini: {
      order: {
        phone: "0500000054",
        wilaya: "Oran",
        items: [{ productName: "parfum", quantity: 1, unitPrice: 5000 }],
        totalPrice: 5000,
      },
    },
  },
  {
    id: "GE-005",
    language: "ar",
    category: "gemini-complement",
    note: "Persian-variant digits (۰۱۲…) are prompt authority; regex sees no digits at all.",
    message: "نحب ۱ ساعة ذكية ۵۰۰۰ دج وهران ۰۵۰۰۰۰۰۰۵۵",
    regex: { order: null, isComplete: false, missingFields: ["items", "phone"], minConfidence: 0.25 },
    gemini: {
      order: {
        phone: "0500000055",
        wilaya: "Oran",
        items: [{ productName: "ساعة ذكية", quantity: 1, unitPrice: 5000 }],
      },
    },
  },
];

/** All corpus cases in frozen order. */
export function corpusCases(): readonly ExtractionCorpusCase[] {
  return EXTRACTION_CORPUS;
}

/** Build the extractor input for a case. */
export function corpusInputFor(c: ExtractionCorpusCase): ExtractionInput {
  return { body: c.message, ...(c.knownPhone !== undefined ? { knownPhone: c.knownPhone } : {}) };
}
