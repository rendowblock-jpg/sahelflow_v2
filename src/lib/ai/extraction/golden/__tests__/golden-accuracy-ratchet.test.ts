import { describe, expect, it } from "vitest";

import { GOLDEN_SET } from "../golden-set";
import { offlineReading, scoreSplit } from "../scoring";
import { isDev, isHoldout } from "../split";

/**
 * PB-EXTRACTION-GOLDEN-SET: an accuracy RATCHET for the offline order reader, run in CI with no network, no key and
 * no database. It is NOT the premium bar (that asks for 97% on product and quantity; the reader is far below it, see
 * the numbers below). It only makes sure the reader cannot silently get WORSE: every figure below is what the reader
 * scores today, rounded down to half a point (or, for a count of entries with a critical error, rounded up), so a
 * single entry lost on the held-out half fails the build.
 *
 *  - Scored over the entries nobody disputes (220 of 231); the 11 DISPUTED ones are pinned in golden-set.test.ts.
 *  - The held-out half is the even ids (split.ts). Its failure messages carry COUNTS ONLY, never an id or a text, so a
 *    red build cannot teach anyone about a single held-out message.
 *  - Raise a floor when the reader improves. Lower one only with a written reason in the commit; a lower figure
 *    means a worse reader.
 *
 * Measured 26 Oct 2026 on main d24e5ebd (offline reader, wave 1 of the offline reader merged in #618):
 *   held-out (109 scored): order-or-not 92, product+quantity 73 of 98, unit price 21 of 28, phone 85 of 86, critical 17
 *   dev (111 scored, tuned on, so inflated): order-or-not 105, product+quantity 84 of 103, phone 87 of 87, critical 1
 */

type Rule = { field: string; min: number; label: string };
type HalfRules = { minScored: number; fields: Rule[]; maxCriticalShare: number };

/** Percent, not a fraction. A field whose tally is empty fails (a renamed field cannot pass by being absent). */
const HOLDOUT: HalfRules = {
  minScored: 100,
  maxCriticalShare: 16.0,
  fields: [
    { field: "isOrder", min: 84.0, label: "order-or-not" },
    { field: "product", min: 81.5, label: "product found" },
    { field: "quantity", min: 91.0, label: "quantity (of products found)" },
    { field: "productAndQuantity", min: 74.0, label: "product and quantity" },
    { field: "unitPrice", min: 75.0, label: "unit price" },
    { field: "unitPriceNotInvented", min: 100, label: "no invented unit price" },
    { field: "wilaya", min: 100, label: "wilaya" },
    { field: "commune", min: 100, label: "commune" },
    { field: "phone", min: 98.5, label: "phone" },
    { field: "phoneNotInvented", min: 100, label: "no invented phone" },
  ],
};

const DEV: HalfRules = {
  minScored: 100,
  maxCriticalShare: 1.0,
  fields: [
    { field: "isOrder", min: 94.5, label: "order-or-not" },
    { field: "product", min: 82.5, label: "product found" },
    { field: "quantity", min: 98.5, label: "quantity (of products found)" },
    { field: "productAndQuantity", min: 81.5, label: "product and quantity" },
    { field: "unitPrice", min: 70.5, label: "unit price" },
    { field: "unitPriceNotInvented", min: 100, label: "no invented unit price" },
    { field: "wilaya", min: 100, label: "wilaya" },
    { field: "commune", min: 100, label: "commune" },
    { field: "phone", min: 100, label: "phone" },
    { field: "phoneNotInvented", min: 100, label: "no invented phone" },
  ],
};

function scoreHalf(pick: (entry: { id: string }) => boolean) {
  const entries = GOLDEN_SET.filter(pick);
  const result = scoreSplit(entries, offlineReading);
  const scored = new Set(entries.filter((entry) => entry.disputed === undefined).map((entry) => entry.id));
  const critical = [...result.criticalEntries].filter((id) => scored.has(id)).length;
  return { scored: scored.size, critical, tallies: result.overallNotDisputed, errors: result.errorIds.length };
}

function checkHalf(name: string, pick: (entry: { id: string }) => boolean, rules: HalfRules) {
  describe(`offline reader accuracy ratchet: ${name} half`, () => {
    const half = scoreHalf(pick);

    it("scores every entry (the reader never returns nothing) and enough of them", () => {
      expect(half.errors, `${name}: entries the reader could not score`).toBe(0);
      expect(half.scored, `${name}: scored entries`).toBeGreaterThanOrEqual(rules.minScored);
    });

    it.each(rules.fields)("$label stays at or above $min%", ({ field, min }) => {
      const cell = half.tallies[field];
      expect(cell, `${name}: no tally for ${field}`).toBeDefined();
      expect(cell!.total, `${name} ${field}: nothing was scored`).toBeGreaterThan(0);
      const percent = (100 * cell!.correct) / cell!.total;
      expect(percent, `${name} ${field}: ${cell!.correct} of ${cell!.total}`).toBeGreaterThanOrEqual(min);
    });

    it(`entries with a critical error stay at or below ${rules.maxCriticalShare}% of the scored entries`, () => {
      const percent = (100 * half.critical) / half.scored;
      expect(percent, `${name}: ${half.critical} of ${half.scored} entries have a critical error`).toBeLessThanOrEqual(rules.maxCriticalShare);
    });
  });
}

checkHalf("held-out", isHoldout, HOLDOUT);
checkHalf("dev", isDev, DEV);
