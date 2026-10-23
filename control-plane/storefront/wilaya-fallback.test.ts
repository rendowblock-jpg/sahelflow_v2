import { describe, expect, it } from "vitest";

import { MOTHER_OF_NEW_WILAYA, motherWilaya, withMotherFeeFallback } from "./wilaya-fallback";

type Rule = { wilayaCode: string; mode: "home" | "desk"; feeDzd: number };
const rule = (wilayaCode: string, mode: "home" | "desk", feeDzd: number): Rule => ({ wilayaCode, mode, feeDzd });
const key = (r: Rule) => `${r.wilayaCode}:${r.mode}:${r.feeDzd}`;

describe("mother wilaya of the eleven new wilayas (Loi 26-06, JO n.25 art. 52 bis 10-20)", () => {
  it("maps exactly 59..69 to the ten wilayas the law cut, as listed in the arrete annex (JO n.58)", () => {
    expect(MOTHER_OF_NEW_WILAYA).toEqual({
      "59": "03", // Aflou        <- Laghouat
      "60": "05", // Barika       <- Batna
      "61": "07", // El Kantara   <- Biskra
      "62": "12", // Bir El Ater  <- Tebessa
      "63": "13", // El Aricha    <- Tlemcen
      "64": "14", // Ksar Chellala <- Tiaret
      "65": "17", // Ain Ouessara <- Djelfa
      "66": "17", // Messaad      <- Djelfa
      "67": "26", // Ksar El Boukhari <- Medea
      "68": "28", // Bou Saada    <- M'Sila
      "69": "32", // El Abiodh Sidi Cheikh <- El Bayadh
    });
  });

  it("answers null for an old wilaya, an unknown code and garbage", () => {
    for (const code of ["01", "16", "58", "70", "00", "", "5", "059", "abc"]) expect(motherWilaya(code)).toBeNull();
    expect(motherWilaya("59")).toBe("03");
    expect(motherWilaya("66")).toBe("17");
  });

  it("answers null for the names every object inherits (a lookup table is not a safe-key set)", () => {
    for (const code of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(motherWilaya(code)).toBeNull();
    }
  });
});

describe("withMotherFeeFallback", () => {
  it("gives a new wilaya its mother's fee for each mode it has no rule for", () => {
    const out = withMotherFeeFallback([rule("03", "home", 600), rule("03", "desk", 400)]);
    expect(out.map(key).sort()).toEqual(
      ["03:home:600", "03:desk:400", "59:home:600", "59:desk:400"].sort(),
    );
  });

  it("keeps a rule the seller wrote for the new wilaya and fills only the missing mode", () => {
    const out = withMotherFeeFallback([rule("03", "home", 600), rule("03", "desk", 400), rule("59", "home", 900)]);
    expect(out.filter((r) => r.wilayaCode === "59").map(key).sort()).toEqual(["59:desk:400", "59:home:900"].sort());
  });

  it("does not invent a mode the mother does not offer", () => {
    const out = withMotherFeeFallback([rule("03", "home", 600)]);
    expect(out.filter((r) => r.wilayaCode === "59").map(key)).toEqual(["59:home:600"]);
  });

  it("feeds two new wilayas from one mother (Djelfa -> 65 and 66)", () => {
    const out = withMotherFeeFallback([rule("17", "home", 700)]);
    expect(out.filter((r) => ["65", "66"].includes(r.wilayaCode)).map(key).sort()).toEqual(["65:home:700", "66:home:700"]);
  });

  it("adds one row, not two, when the input lists the mother's rule twice (the database cannot, a caller could)", () => {
    const out = withMotherFeeFallback([rule("03", "home", 600), rule("03", "home", 600)]);
    expect(out.filter((r) => r.wilayaCode === "59")).toHaveLength(1);
  });

  it("never lets a mother borrow from a child, and never touches old wilayas", () => {
    const out = withMotherFeeFallback([rule("59", "home", 900), rule("16", "home", 500)]);
    expect(out.map(key).sort()).toEqual(["16:home:500", "59:home:900"]);
  });

  it("returns the input unchanged when no mother is priced, and is idempotent", () => {
    const input = [rule("16", "home", 500), rule("31", "desk", 300)];
    expect(withMotherFeeFallback(input).map(key)).toEqual(input.map(key));
    const once = withMotherFeeFallback([rule("03", "home", 600)]);
    expect(withMotherFeeFallback(once).map(key).sort()).toEqual(once.map(key).sort());
  });

  it("does not modify the array it was given and keeps the extra fields of each rule", () => {
    const input = [{ ...rule("03", "home", 600), tag: "x" }];
    const out = withMotherFeeFallback(input);
    expect(input).toHaveLength(1);
    expect(out.find((r) => r.wilayaCode === "59")).toMatchObject({ tag: "x", feeDzd: 600 });
  });
});
