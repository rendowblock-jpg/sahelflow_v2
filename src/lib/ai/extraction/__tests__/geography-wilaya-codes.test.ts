import { describe, expect, it } from "vitest";

import wilayas from "../../../../../data/wilayas.json";
import { findWilayaMentions } from "../geography";

/**
 * A customer who writes "wilaya 61" names a wilaya by its number. The data file has 69 wilayas
 * (the eleven of Loi 26-06 are 59 to 69), so every one of them must be read, and a number that
 * is not a wilaya must not be.
 */
const codesIn = (text: string): number[] => findWilayaMentions(text).map((mention) => mention.code);

describe("an explicit wilaya number in a customer message", () => {
  it("is read for every wilaya of the data file, 1 to 69", () => {
    expect(wilayas.length).toBe(69);
    for (const row of wilayas) {
      expect(codesIn(`livraison wilaya ${row.code}`), `wilaya ${row.code}`).toContain(row.code);
    }
  });

  it("is read for the eleven new wilayas with a prefix or a colon too", () => {
    for (let code = 59; code <= 69; code += 1) {
      expect(codesIn(`fi wilaya ${code}`), `fi wilaya ${code}`).toContain(code);
      expect(codesIn(`wilaya: ${code}`), `wilaya: ${code}`).toContain(code);
    }
  });

  it("is ignored when the number is not a wilaya: 0, 70 and 99", () => {
    expect(codesIn("wilaya 0")).toEqual([]);
    expect(codesIn("wilaya 70")).toEqual([]);
    expect(codesIn("wilaya 99")).toEqual([]);
  });

  it("keeps reading the old last wilaya, 58", () => {
    expect(codesIn("wilaya 58")).toContain(58);
  });
});
