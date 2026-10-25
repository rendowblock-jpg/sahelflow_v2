/**
 * Scoring of the golden set, shared by the manual measurement (zz-golden-measure.manual.test.ts) and the live
 * Groq report (live-report.ts), so both rank readers with the SAME code and the SAME metrics.
 *
 * scoreSplit() takes the entries and a reader callback. The callback returns what the reader said for one entry
 * (is it an order, and the fields), or null when there is no usable answer (an infrastructure error): that entry is
 * skipped and listed in errorIds, never scored as a wrong answer.
 */
import { extractWithRegex, normalizePhone, readOrderFields } from "@/lib/ai/extraction/regex-extractor";
import type { ExtractedItem, ExtractedOrder } from "@/lib/ai/extraction/types";
import type { GoldenEntry, GoldenItem } from "./golden-set";

export interface Tally {
  correct: number;
  total: number;
}
export interface Failure {
  id: string;
  language: string;
  field: string;
  kind: string;
  expected: unknown;
  got: unknown;
  tags: string[];
  disputed: boolean;
}

export function asciiDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/** Case, accents, Arabic marks, hamza forms and punctuation are not differences. */
export function fold(text: string): string {
  return asciiDigits(text)
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/\p{M}/gu, "")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ڨ/g, "ق")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function sameText(a: string, b: string): { strict: boolean; lenient: boolean } {
  const fa = fold(a);
  const fb = fold(b);
  const strict = fa === fb && fa.length > 0;
  const shorter = Math.min(fa.length, fb.length);
  return { strict, lenient: strict || (shorter >= 3 && (fa.includes(fb) || fb.includes(fa))) };
}

export function tokenOverlap(expected: string, got: string): number {
  const wanted = fold(expected).split(" ").filter(Boolean);
  const have = new Set(fold(got).split(" ").filter(Boolean));
  return wanted.length === 0 ? 0 : wanted.filter((t) => have.has(t)).length / wanted.length;
}

export function wilsonLower(correct: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = correct / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return (centre - margin) / denominator;
}

export function expectedItems(entry: GoldenEntry): GoldenItem[] {
  const { expected } = entry;
  if (expected.items) return expected.items;
  if (!expected.productName) return [];
  return [
    {
      productName: expected.productName,
      quantity: expected.quantity ?? 1,
      ...(expected.unitPrice !== undefined ? { unitPrice: expected.unitPrice } : {}),
    },
  ];
}

/** Each expected item takes the best unused extracted item with the same product. */
function matchItems(wanted: GoldenItem[], got: ExtractedItem[]) {
  const used = new Set<number>();
  return wanted.map((want) => {
    let best = -1;
    let bestStrict = false;
    got.forEach((item, index) => {
      if (used.has(index)) return;
      const same = sameText(want.productName, item.productName);
      if (same.strict && !bestStrict) {
        best = index;
        bestStrict = true;
      } else if (same.lenient && best === -1) {
        best = index;
      }
    });
    if (best >= 0) used.add(best);
    return { want, item: best >= 0 ? got[best] : undefined, strict: bestStrict };
  });
}

export interface Reading {
  /** The reader says the message is an order. */
  predictedOrder: boolean;
  got: ExtractedOrder;
}

/** The offline reader (regex), exactly as the manual baseline runs it. */
export function offlineReading(entry: GoldenEntry): Reading {
  const input = { body: entry.text };
  const result = extractWithRegex(input);
  return { predictedOrder: result.order !== null, got: readOrderFields(input).order };
}

export function scoreSplit(entries: readonly GoldenEntry[], read: (entry: GoldenEntry) => Reading | null) {
  const overall: Record<string, Tally> = {};
  const overallNotDisputed: Record<string, Tally> = {};
  const byLanguage: Record<string, Record<string, Tally>> = {};
  const failures: Failure[] = [];
  const criticalKinds: Record<string, number> = {};
  const entryClean = new Map<string, boolean>();
  const criticalEntries = new Set<string>();
  const perEntry: Record<string, unknown>[] = [];
  const errorIds: string[] = [];

  for (const entry of entries) {
    const language = entry.language;
    byLanguage[language] ??= {};
    let clean = true;
    const tags = entry.tags ?? [];

    const score = (
      field: string,
      ok: boolean,
      kind: string,
      expected: unknown,
      got: unknown,
      critical = false,
    ) => {
      const buckets = [overall, byLanguage[language], entry.disputed === undefined ? overallNotDisputed : undefined];
      for (const bucket of buckets) {
        if (!bucket) continue;
        const cell = (bucket[field] ??= { correct: 0, total: 0 });
        cell.total += 1;
        if (ok) cell.correct += 1;
      }
      if (ok) return;
      clean = false;
      failures.push({ id: entry.id, language, field, kind, expected, got, tags, disputed: entry.disputed !== undefined });
      if (critical) {
        criticalEntries.add(entry.id);
        criticalKinds[`${field}:${kind}`] = (criticalKinds[`${field}:${kind}`] ?? 0) + 1;
      }
    };


    const reading = read(entry);
    if (!reading) {
      errorIds.push(entry.id);
      continue;
    }
    const { predictedOrder, got } = reading;
    const wantOrder = entry.expected.isOrder;
    score(
      "isOrder",
      predictedOrder === wantOrder,
      wantOrder ? "missed-order" : "false-order",
      wantOrder,
      predictedOrder,
      !wantOrder,
    );

    perEntry.push({
      id: entry.id,
      disputed: entry.disputed,
      order: predictedOrder,
      items: got.items.map((i) => `${i.quantity} x ${i.productName}${i.unitPrice ? ` @${i.unitPrice}` : ""}`),
      customerName: got.customerName,
      phone: got.phone,
      wilaya: got.wilaya,
      commune: got.commune,
      address: got.address,
      totalPrice: got.totalPrice,
      notes: got.notes,
    });

    if (wantOrder) {
      const wanted = expectedItems(entry);
      const matches = matchItems(wanted, got.items);
      const priceAnywhere =
        entry.expected.unitPrice !== undefined ||
        entry.expected.totalPrice !== undefined ||
        wanted.some((w) => w.unitPrice !== undefined);

      for (const { want, item, strict } of matches) {
        score("product", item !== undefined, "missed", want.productName, got.items.map((i) => i.productName));
        score("productStrict", item !== undefined && strict, item ? "different-wording" : "missed", want.productName, item?.productName);
        if (item) {
          score("quantity", item.quantity === want.quantity, "wrong", want.quantity, item.quantity, true);
        }
        score(
          "productAndQuantity",
          item !== undefined && item.quantity === want.quantity,
          item ? "wrong-quantity" : "missed",
          `${want.quantity} x ${want.productName}`,
          item ? `${item.quantity} x ${item.productName}` : undefined,
        );
        if (want.unitPrice !== undefined) {
          score(
            "unitPrice",
            item?.unitPrice === want.unitPrice,
            item?.unitPrice === undefined ? "omitted" : "wrong",
            want.unitPrice,
            item?.unitPrice,
            item?.unitPrice !== undefined,
          );
        } else if (item && !priceAnywhere) {
          score("unitPriceNotInvented", item.unitPrice === undefined, "spurious", undefined, item.unitPrice, true);
        }
      }
      score("itemCount", got.items.length === wanted.length, got.items.length > wanted.length ? "extra-items" : "missing-items", wanted.length, got.items.length, got.items.length > wanted.length);

      if (entry.expected.totalPrice !== undefined) {
        score("totalPrice", got.totalPrice === entry.expected.totalPrice, got.totalPrice === undefined ? "omitted" : "wrong", entry.expected.totalPrice, got.totalPrice, got.totalPrice !== undefined);
      }

      const scoreText = (field: "customerName" | "address" | "commune" | "wilaya", critical: boolean) => {
        const want = entry.expected[field];
        const have = got[field];
        if (want !== undefined) {
          const same = have === undefined ? { strict: false, lenient: false } : sameText(want, have);
          score(field, same.lenient, have === undefined ? "omitted" : "wrong", want, have, critical && have !== undefined);
          if (field === "customerName" || field === "address") {
            score(`${field}Strict`, same.strict, have === undefined ? "omitted" : "different-wording", want, have);
          }
        } else {
          score(`${field}NotInvented`, have === undefined, "spurious", undefined, have, critical);
        }
      };
      scoreText("customerName", false);
      scoreText("wilaya", true);
      scoreText("commune", false);
      scoreText("address", false);

      const wantPhone = entry.expected.phone;
      const havePhone = got.phone;
      if (wantPhone !== undefined) {
        score("phone", normalizePhone(havePhone) === wantPhone, havePhone === undefined ? "omitted" : "wrong", wantPhone, havePhone, havePhone !== undefined);
      } else {
        score("phoneNotInvented", havePhone === undefined, "spurious", undefined, havePhone, true);
      }

      if (entry.expected.notes !== undefined) {
        const ok = got.notes !== undefined && tokenOverlap(entry.expected.notes, got.notes) >= 0.5;
        score("notes", ok, got.notes === undefined ? "omitted" : "wrong", entry.expected.notes, got.notes);
      }
    }
    entryClean.set(entry.id, clean);
  }

  return { overall, overallNotDisputed, byLanguage, failures, criticalKinds, entryClean, criticalEntries, perEntry, errorIds };
}

export function accuracy(t: Tally) {
  return {
    correct: t.correct,
    total: t.total,
    accuracy: t.total === 0 ? null : Number((t.correct / t.total).toFixed(4)),
    wilsonLower95: Number(wilsonLower(t.correct, t.total).toFixed(4)),
  };
}

export function table(tallies: Record<string, Tally>) {
  return Object.fromEntries(Object.entries(tallies).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, accuracy(v)]));
}
