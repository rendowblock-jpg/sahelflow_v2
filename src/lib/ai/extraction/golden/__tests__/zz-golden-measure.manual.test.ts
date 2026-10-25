/**
 * MANUAL measurement, not part of CI: it only runs when GOLDEN_MEASURE=1.
 *
 *   GOLDEN_MEASURE=1 GOLDEN_OUT_DIR=/some/dir sf vt wt-NAME \
 *     src/lib/ai/extraction/golden/__tests__/zz-golden-measure.manual.test.ts
 *
 * It runs the OFFLINE reader only (readOrderFields + extractWithRegex): no
 * network, no Gemini key, no database. It scores every golden entry against
 * the label written by meaning and writes baseline.json and baseline.md to
 * GOLDEN_OUT_DIR. It never asserts accuracy: the numbers are the finding.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { extractWithRegex, normalizePhone, readOrderFields } from "@/lib/ai/extraction/regex-extractor";
import type { ExtractedItem, ExtractedOrder } from "@/lib/ai/extraction/types";
import { GOLDEN_SET, GOLDEN_SET_VERSION, type GoldenEntry, type GoldenItem } from "../golden-set";

const RUN = process.env.GOLDEN_MEASURE === "1";
const OUT_DIR = process.env.GOLDEN_OUT_DIR ?? join(tmpdir(), "golden-baseline");

interface Tally {
  correct: number;
  total: number;
}
interface Failure {
  id: string;
  language: string;
  field: string;
  kind: string;
  expected: unknown;
  got: unknown;
  tags: string[];
}

function asciiDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/** Case, accents, Arabic marks, hamza forms and punctuation are not differences. */
function fold(text: string): string {
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

function sameText(a: string, b: string): { strict: boolean; lenient: boolean } {
  const fa = fold(a);
  const fb = fold(b);
  const strict = fa === fb && fa.length > 0;
  const shorter = Math.min(fa.length, fb.length);
  return { strict, lenient: strict || (shorter >= 3 && (fa.includes(fb) || fb.includes(fa))) };
}

function tokenOverlap(expected: string, got: string): number {
  const wanted = fold(expected).split(" ").filter(Boolean);
  const have = new Set(fold(got).split(" ").filter(Boolean));
  return wanted.length === 0 ? 0 : wanted.filter((t) => have.has(t)).length / wanted.length;
}

function wilsonLower(correct: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = correct / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return (centre - margin) / denominator;
}

function expectedItems(entry: GoldenEntry): GoldenItem[] {
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

describe.skipIf(!RUN)("golden set baseline (manual)", () => {
  it("scores the offline reader against every golden entry and writes the evidence", () => {
    const overall: Record<string, Tally> = {};
    const byLanguage: Record<string, Record<string, Tally>> = {};
    const failures: Failure[] = [];
    const criticalKinds: Record<string, number> = {};
    const entryClean = new Map<string, boolean>();
    const criticalEntries = new Set<string>();
    const perEntry: Record<string, unknown>[] = [];

    for (const entry of GOLDEN_SET) {
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
        for (const bucket of [overall, byLanguage[language]]) {
          if (!bucket) continue;
          const cell = (bucket[field] ??= { correct: 0, total: 0 });
          cell.total += 1;
          if (ok) cell.correct += 1;
        }
        if (ok) return;
        clean = false;
        failures.push({ id: entry.id, language, field, kind, expected, got, tags });
        if (critical) {
          criticalEntries.add(entry.id);
          criticalKinds[`${field}:${kind}`] = (criticalKinds[`${field}:${kind}`] ?? 0) + 1;
        }
      };

      const input = { body: entry.text };
      const result = extractWithRegex(input);
      const predictedOrder = result.order !== null;
      const wantOrder = entry.expected.isOrder;
      score(
        "isOrder",
        predictedOrder === wantOrder,
        wantOrder ? "missed-order" : "false-order",
        wantOrder,
        predictedOrder,
        !wantOrder,
      );

      const got: ExtractedOrder = readOrderFields(input).order;
      perEntry.push({
        id: entry.id,
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

    const accuracy = (t: Tally) => ({
      correct: t.correct,
      total: t.total,
      accuracy: t.total === 0 ? null : Number((t.correct / t.total).toFixed(4)),
      wilsonLower95: Number(wilsonLower(t.correct, t.total).toFixed(4)),
    });
    const table = (tallies: Record<string, Tally>) =>
      Object.fromEntries(Object.entries(tallies).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, accuracy(v)]));

    const byTag: Record<string, { n: number; fullyCorrect: number }> = {};
    for (const entry of GOLDEN_SET) {
      for (const tag of entry.tags ?? []) {
        byTag[tag] ??= { n: 0, fullyCorrect: 0 };
        byTag[tag].n += 1;
        if (entryClean.get(entry.id)) byTag[tag].fullyCorrect += 1;
      }
    }

    const shapeMap = new Map<string, Failure[]>();
    for (const failure of failures) {
      const key = `${failure.field}:${failure.kind}`;
      shapeMap.set(key, [...(shapeMap.get(key) ?? []), failure]);
    }
    const shapes = [...shapeMap.entries()]
      .map(([shape, list]) => {
        const tagCounts: Record<string, number> = {};
        for (const f of list) for (const t of f.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
        const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        return {
          shape,
          count: list.length,
          topTags: topTags.map(([t, c]) => `${t} (${c})`),
          exampleIds: list.slice(0, 3).map((f) => f.id),
          example: { id: list[0]?.id, expected: list[0]?.expected, got: list[0]?.got },
        };
      })
      .sort((a, b) => b.count - a.count);

    const ordersN = GOLDEN_SET.filter((e) => e.expected.isOrder).length;
    const report = {
      goldenVersion: GOLDEN_SET_VERSION,
      generatedAt: new Date().toISOString(),
      extractor: "readOrderFields + extractWithRegex (offline reader, no network, no Gemini)",
      entries: GOLDEN_SET.length,
      orders: ordersN,
      notOrders: GOLDEN_SET.length - ordersN,
      overall: table(overall),
      byLanguage: Object.fromEntries(Object.entries(byLanguage).map(([l, t]) => [l, table(t)])),
      criticalEntries: { count: criticalEntries.size, of: GOLDEN_SET.length, kinds: criticalKinds },
      fullyCorrectEntries: { count: [...entryClean.values()].filter(Boolean).length, of: GOLDEN_SET.length },
      byTag: Object.fromEntries(Object.entries(byTag).sort((a, b) => b[1].n - a[1].n)),
      shapes,
      failures,
      perEntry,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, "baseline.json"), `${JSON.stringify(report, null, 2)}\n`);

    const pct = (a: { accuracy: number | null }) => (a.accuracy === null ? "-" : `${(a.accuracy * 100).toFixed(1)}%`);
    const lines: string[] = [
      `# Golden set baseline (${GOLDEN_SET_VERSION})`,
      "",
      `Offline reader only (no network, no key). ${report.entries} entries (${report.orders} orders, ${report.notOrders} not-an-order). Generated ${report.generatedAt}.`,
      "",
      "| field | correct/total | accuracy | Wilson 95% lower |",
      "|---|---|---|---|",
      ...Object.entries(report.overall).map(([f, a]) => `| ${f} | ${a.correct}/${a.total} | ${pct(a)} | ${(a.wilsonLower95 * 100).toFixed(1)}% |`),
      "",
      `Entries with a critical error (wrong phone/wilaya/quantity/price, invented price/phone/wilaya, extra item, order from a non-order): ${report.criticalEntries.count} of ${report.entries}.`,
      `Entries with every check right: ${report.fullyCorrectEntries.count} of ${report.entries}.`,
      "",
      "## By language",
      "",
      "| language | isOrder | product | productAndQuantity | phone | wilaya |",
      "|---|---|---|---|---|---|",
      ...Object.entries(report.byLanguage).map(([l, t]) => {
        const cell = (f: string) => (t[f] ? `${t[f].correct}/${t[f].total} (${pct(t[f])})` : "-");
        return `| ${l} | ${cell("isOrder")} | ${cell("product")} | ${cell("productAndQuantity")} | ${cell("phone")} | ${cell("wilaya")} |`;
      }),
      "",
      "## Top failure shapes",
      "",
      "| shape (field:kind) | count | top tags | example |",
      "|---|---|---|---|",
      ...shapes.slice(0, 12).map((s) => `| ${s.shape} | ${s.count} | ${s.topTags.join(", ")} | ${s.exampleIds.join(", ")} |`),
      "",
    ];
    writeFileSync(join(OUT_DIR, "baseline.md"), `${lines.join("\n")}\n`);

    // The only assertion: every entry was scored. The numbers are the finding.
    expect(overall.isOrder?.total).toBe(GOLDEN_SET.length);
  });
});
