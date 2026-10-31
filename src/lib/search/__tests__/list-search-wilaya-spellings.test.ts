import { describe, expect, it } from "vitest";

import wilayas from "../../../../data/wilayas.json";
import { WILAYA_CODES } from "@/lib/wilaya-display";
import { foldedWilayaSpellings } from "../list-search-candidates";

/**
 * Typing a wilaya in the orders-list search must find the orders stored under it. The list of
 * spellings is built by looping over the wilaya codes: that loop used to stop at 58, so a shop
 * that typed the name of one of the eleven new wilayas (59 to 69) found nothing.
 */
describe("the wilaya codes the lists loop over", () => {
  it("are exactly the codes of the data file, 69 today", () => {
    expect(WILAYA_CODES.length).toBe(wilayas.length);
    expect(WILAYA_CODES.length).toBe(69);
    expect([...WILAYA_CODES].sort((a, b) => a - b)).toEqual(wilayas.map((row) => row.code).sort((a, b) => a - b));
  });
});

describe("typing a wilaya in the orders search", () => {
  it("finds every wilaya of the data file by its French name, 1 to 69", () => {
    for (const row of wilayas) {
      expect(foldedWilayaSpellings(row.name), `${row.code} ${row.name}`).toContain(row.name);
    }
  });

  it("finds every wilaya by its Arabic name when it has one", () => {
    for (const row of wilayas) {
      if (!row.nameAr) continue;
      expect(foldedWilayaSpellings(row.nameAr), `${row.code} ${row.nameAr}`).toContain(row.nameAr);
    }
  });

  it("finds the eleven new wilayas by their number", () => {
    for (let code = 59; code <= 69; code += 1) {
      expect(foldedWilayaSpellings(String(code)), `code ${code}`).toContain(String(code));
    }
  });

  it("finds nothing for a text that is no wilaya", () => {
    expect(foldedWilayaSpellings("zzzzqqq")).toEqual([]);
  });
});
