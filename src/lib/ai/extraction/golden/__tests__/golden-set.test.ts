/**
 * Structure checks for the extraction golden set. These do NOT run the
 * extractor: accuracy is measured by hand (zz-golden-measure.manual.test.ts).
 * They guard the set itself: size, buckets, fake phones, labels that really
 * appear in the message, wilayas that exist in the project table.
 */
import { describe, expect, it } from "vitest";

import communes from "../../../../../../data/communes.json";
import wilayas from "../../../../../../data/wilayas.json";
import { normalizePhone } from "@/lib/ai/extraction/fields";
import { canonicalWilaya } from "@/lib/ai/extraction/geography";
import {
  GOLDEN_FAKE_PHONE_PATTERNS,
  GOLDEN_SET,
  type GoldenEntry,
  type GoldenLanguage,
} from "../golden-set";

const MIN_TOTAL = 200;
const MIN_BY_LANGUAGE: Record<GoldenLanguage, number> = {
  ar: 60,
  arabizi: 50,
  fr: 40,
  mixed: 30,
  "ar-msa": 3,
};
const MIN_NOT_AN_ORDER = 30;

const ARABIC_SCRIPT = /[\u0600-\u06FF]/u;
const LATIN_LETTER = /[A-Za-z]/;

/** Arabic-Indic and Persian digits to ASCII, so numbers can be compared. */
function asciiDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/** Every digit run of 9+ digits (spaces, dots and dashes allowed inside). */
function phoneShapedRuns(text: string): string[] {
  const runs = asciiDigits(text).match(/(?<![\p{L}\d])\+?\d(?:[ \t.-]?\d)+/gu) ?? [];
  return runs.map((run) => run.replace(/\D/g, "")).filter((digits) => digits.length >= 9);
}

function itemsOf(entry: GoldenEntry) {
  const { expected } = entry;
  if (expected.items) return expected.items;
  if (expected.productName) {
    return [{ productName: expected.productName, quantity: expected.quantity ?? 0 }];
  }
  return [];
}

const orders = GOLDEN_SET.filter((e) => e.expected.isOrder);
const nonOrders = GOLDEN_SET.filter((e) => !e.expected.isOrder);
const wilayaNames = new Set(wilayas.map((w) => w.name));

describe("golden set: size and buckets", () => {
  it(`has at least ${MIN_TOTAL} entries`, () => {
    expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(MIN_TOTAL);
  });

  it("has unique, well-formed ids", () => {
    const ids = GOLDEN_SET.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^G-(AR|AZ|FR|MX|MSA)-\d{3}$/);
  });

  it.each(Object.entries(MIN_BY_LANGUAGE))("language %s reaches its minimum of %i", (language, min) => {
    const count = GOLDEN_SET.filter((e) => e.language === language).length;
    expect(count).toBeGreaterThanOrEqual(min);
  });

  it(`has at least ${MIN_NOT_AN_ORDER} not-an-order entries, about a sixth of the set`, () => {
    const share = nonOrders.length / GOLDEN_SET.length;
    expect(nonOrders.length).toBeGreaterThanOrEqual(MIN_NOT_AN_ORDER);
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.25);
  });

  it("source and isOrder agree, and a not-an-order entry carries no other label", () => {
    for (const entry of GOLDEN_SET) {
      expect(entry.source === "not-an-order", entry.id).toBe(!entry.expected.isOrder);
      if (!entry.expected.isOrder) expect(Object.keys(entry.expected), entry.id).toEqual(["isOrder"]);
    }
  });

  it("writes each language in its own script", () => {
    for (const entry of GOLDEN_SET) {
      const arabic = ARABIC_SCRIPT.test(entry.text);
      const latin = LATIN_LETTER.test(entry.text);
      if (entry.language === "arabizi" || entry.language === "fr") {
        expect(arabic, `${entry.id} has Arabic script`).toBe(false);
      }
      if (entry.language === "ar" || entry.language === "ar-msa") {
        expect(arabic, `${entry.id} has no Arabic script`).toBe(true);
      }
      if (entry.language === "mixed") {
        expect(arabic && latin, `${entry.id} is not both scripts`).toBe(true);
      }
    }
  });
});

describe("golden set: the shapes the task asks for are present", () => {
  const tagCount = (tag: string) => GOLDEN_SET.filter((e) => e.tags?.includes(tag)).length;
  it.each([
    ["self-correction", 4],
    ["phone-correction", 3],
    ["injection", 4],
    ["injection-in-order", 4],
    ["quoted", 2],
    ["emoji", 5],
    ["arabic-indic-digits", 4],
    ["persian-digits", 1],
    ["zouj", 6],
    ["x2", 3],
    ["phone-+213", 5],
    ["phone-00213", 3],
    ["phone-dots", 3],
    ["wilaya-code", 5],
    ["multi-item", 12],
    ["price", 25],
    ["typo", 2],
    ["commune", 4],
    ["address", 8],
  ])("tag %s appears at least %i times", (tag, min) => {
    expect(tagCount(tag)).toBeGreaterThanOrEqual(min);
  });
});

describe("golden set: order labels", () => {
  it("every order has a product and a positive whole quantity, either single or items", () => {
    for (const entry of orders) {
      const { expected } = entry;
      const single = expected.productName !== undefined;
      const several = expected.items !== undefined;
      expect(single !== several, `${entry.id} needs productName or items, not both`).toBe(true);
      if (expected.items) expect(expected.items.length, entry.id).toBeGreaterThanOrEqual(2);
      for (const item of itemsOf(entry)) {
        expect(item.productName.trim().length, entry.id).toBeGreaterThan(1);
        expect(Number.isInteger(item.quantity) && item.quantity >= 1, `${entry.id} quantity`).toBe(true);
      }
    }
  });

  it("every label that quotes the message really appears in it", () => {
    for (const entry of orders) {
      const text = asciiDigits(entry.text).toLowerCase();
      const appears = (label: string | undefined, what: string) => {
        if (label === undefined) return;
        expect(text.includes(asciiDigits(label).toLowerCase()), `${entry.id} ${what} "${label}"`).toBe(true);
      };
      appears(entry.expected.customerName, "customerName");
      appears(entry.expected.address, "address");
      appears(entry.expected.notes, "notes");
      // A dual form ("سلسلتين") is normalised to the singular product on purpose.
      if (!entry.tags?.includes("dual-form")) {
        for (const item of itemsOf(entry)) appears(item.productName, "product");
      }
    }
  });

  it("every stated price is written in the message", () => {
    for (const entry of orders) {
      const flat = asciiDigits(entry.text).replace(/[ .]/g, "");
      const prices = [
        entry.expected.unitPrice,
        entry.expected.totalPrice,
        ...(entry.expected.items ?? []).map((i) => i.unitPrice),
      ].filter((p): p is number => p !== undefined);
      for (const price of prices) {
        expect(Number.isInteger(price) && price > 0, `${entry.id} price`).toBe(true);
        expect(flat.includes(String(price)), `${entry.id} price ${price}`).toBe(true);
      }
    }
  });
});

describe("golden set: phones are fake and normalise", () => {
  it("no message carries a phone-shaped number outside the fake patterns", () => {
    for (const entry of GOLDEN_SET) {
      for (const digits of phoneShapedRuns(entry.text)) {
        const normal = normalizePhone(digits);
        expect(normal, `${entry.id} phone-shaped run ${digits} is not an Algerian mobile shape`).toBeDefined();
        const fake = GOLDEN_FAKE_PHONE_PATTERNS.some((p) => p.test(normal ?? ""));
        expect(fake, `${entry.id} phone ${normal} looks real`).toBe(true);
      }
    }
  });

  it("every expected phone is a normalised, valid, fake mobile that is in the text", () => {
    let withPhone = 0;
    for (const entry of GOLDEN_SET) {
      const phone = entry.expected.phone;
      if (phone === undefined) continue;
      withPhone += 1;
      expect(normalizePhone(phone), `${entry.id} expected phone is not normalised`).toBe(phone);
      expect(phone, entry.id).toMatch(/^0[5-7]\d{8}$/);
      expect(GOLDEN_FAKE_PHONE_PATTERNS.some((p) => p.test(phone)), `${entry.id} phone looks real`).toBe(true);
      const inText = phoneShapedRuns(entry.text).map((digits) => normalizePhone(digits));
      expect(inText, `${entry.id} phone not written in the message`).toContain(phone);
    }
    expect(withPhone).toBeGreaterThan(120);
  });

  it("a message with no expected phone writes no phone, except where it is a refused instruction", () => {
    for (const entry of orders) {
      if (entry.expected.phone === undefined) {
        expect(phoneShapedRuns(entry.text), `${entry.id} writes a phone the label ignores`).toEqual([]);
      }
    }
  });
});

describe("golden set: wilayas and communes exist in the project tables", () => {
  it("every expected wilaya is a name of data/wilayas.json and resolves to itself", () => {
    let count = 0;
    for (const entry of orders) {
      const wilaya = entry.expected.wilaya;
      if (wilaya === undefined) continue;
      count += 1;
      expect(wilayaNames.has(wilaya), `${entry.id} wilaya "${wilaya}" is not in the table`).toBe(true);
      expect(canonicalWilaya(wilaya), `${entry.id} wilaya "${wilaya}" does not resolve`).toBe(wilaya);
    }
    expect(count).toBeGreaterThan(120);
  });

  it("the wilayas cover many parts of the country", () => {
    const used = new Set(orders.map((e) => e.expected.wilaya).filter(Boolean));
    expect(used.size).toBeGreaterThanOrEqual(35);
  });

  it("every expected commune belongs to the expected wilaya", () => {
    for (const entry of orders) {
      const { commune, wilaya } = entry.expected;
      if (commune === undefined) continue;
      const code = wilayas.find((w) => w.name === wilaya)?.code;
      expect(code, `${entry.id} commune needs a wilaya`).toBeDefined();
      const found = communes.some((c) => c.name === commune && c.wilayaCode === code);
      expect(found, `${entry.id} commune "${commune}" not in wilaya ${wilaya}`).toBe(true);
    }
  });
});

// Entries where the two blind readers read the message differently. They are
// kept in the set but must not count for or against the extractor, so the list
// is pinned: adding one needs a reason here and in the data.
const DISPUTED_IDS = [
  "G-AR-007",
  "G-AR-040",
  "G-AR-048",
  "G-AR-050",
  "G-AR-069",
  "G-AZ-007",
  "G-AZ-034",
  "G-AZ-045",
  "G-AZ-061",
  "G-MSA-004",
  "G-MX-007",
];
const MAX_DISPUTED = 15;
// "Rouiba" is written in the address text; the three readers agree it is the commune.
const ROUIBA_IDS = ["G-AR-038", "G-AZ-032", "G-FR-030"];

describe("golden set: disputed entries and reconciled labels", () => {
  const disputed = GOLDEN_SET.filter((e) => e.disputed !== undefined);

  it("every disputed entry carries a non-empty one-line reason", () => {
    for (const entry of disputed) {
      const reason = entry.disputed ?? "";
      expect(reason.trim().length, `${entry.id} reason is empty`).toBeGreaterThan(0);
      expect(reason.includes("\n"), `${entry.id} reason is not one line`).toBe(false);
    }
  });

  it("the disputed ids are exactly the pinned list", () => {
    expect(disputed.map((e) => e.id).sort()).toEqual([...DISPUTED_IDS].sort());
  });

  it(`at most ${MAX_DISPUTED} entries are disputed`, () => {
    expect(disputed.length).toBeLessThanOrEqual(MAX_DISPUTED);
  });

  it("the three Rouiba entries carry the commune and keep the address", () => {
    for (const id of ROUIBA_IDS) {
      const entry = GOLDEN_SET.find((e) => e.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.expected.commune, `${id} commune`).toBe("Rouiba");
      expect(entry?.expected.address, `${id} address`).toBeDefined();
      expect(entry?.disputed, `${id} is not disputed`).toBeUndefined();
    }
  });
});
