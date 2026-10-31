import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractWithRegex, readOrderFields } from "@/lib/ai/extraction/regex-extractor";
import { HELDOUT_SET } from "./heldout-set";
import { splitReports } from "./scorer";

/**
 * Manual measurement of the OFFLINE reader. Skipped unless SF_HELDOUT_REPORT
 * names a file prefix; then it writes <prefix>-diag.txt (numbers + the failures
 * of the DIAG half) and <prefix>-sealed.txt (numbers only: nobody diagnoses
 * from the SEALED half).
 */
const prefix = process.env.SF_HELDOUT_REPORT;

describe.skipIf(!prefix)("held-out measurement of the offline reader", () => {
  it("scores both halves and writes the two reports", () => {
    const reports = splitReports(HELDOUT_SET, (text) => {
      const input = { body: text };
      return { predictedOrder: extractWithRegex(input).order !== null, order: readOrderFields(input).order };
    });
    const failures = reports.diagFailures.map((f) => `${f.id} ${f.field} ${f.verdict} expected=${f.expected} got=${f.got}`);
    writeFileSync(`${prefix}-diag.txt`, [reports.diag, "", "DIAG FAILURES", ...failures].join("\n"));
    writeFileSync(`${prefix}-sealed.txt`, reports.sealed);
    expect(reports.diag.length).toBeGreaterThan(0);
  });
});
