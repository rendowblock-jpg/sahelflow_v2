/**
 * S06b-12: the offline reader must not count a knownPhone it cannot normalise
 * as a phone found for the order. A raw conversation identifier (for example a
 * linked-device id) would otherwise mark the order complete and add confidence,
 * and could make the router skip the model. Reserved test numbers only.
 */
import { describe, expect, it } from "vitest";

import { extractWithRegex } from "@/lib/ai/extraction/regex-extractor";

const catalog = [{ name: "Montre Connectée" }, { name: "Sac à Main Femme" }];
const BODY = "2x montre 3000 da Oran";

describe("offline reader knownPhone fallback", () => {
  it("does not count an un-normalisable knownPhone as a present phone", () => {
    const result = extractWithRegex({ body: BODY, catalog, knownPhone: "123" });
    expect(result.order?.phone).toBeUndefined();
    expect(result.missingFields).toContain("phone");
    expect(result.isComplete).toBe(false);
  });

  it("does not add the phone confidence for an un-normalisable knownPhone", () => {
    const junk = extractWithRegex({ body: BODY, catalog, knownPhone: "lid-998877" });
    const valid = extractWithRegex({ body: BODY, catalog, knownPhone: "0500000067" });
    expect(valid.confidence - junk.confidence).toBeCloseTo(0.2, 5);
  });

  it("still uses a normalisable knownPhone when the message has no number", () => {
    const result = extractWithRegex({ body: BODY, catalog, knownPhone: "0500000067" });
    expect(result.order?.phone).toBe("0500000067");
    expect(result.isComplete).toBe(true);
  });

  it("prefers a number written in the message over knownPhone", () => {
    const result = extractWithRegex({
      body: `${BODY} 0500000068`,
      catalog,
      knownPhone: "0500000067",
    });
    expect(result.order?.phone).toBe("0500000068");
  });
});
