import { describe, expect, it } from "vitest";

import { hasArabic, splitArabicRuns, type TextRun } from "../text-language";

function joined(runs: TextRun[]): string {
  return runs.map((run) => run.text).join("");
}

describe("splitArabicRuns", () => {
  it("pure Latin is one untagged run", () => {
    expect(splitArabicRuns("Bonjour, je veux 2 pièces")).toEqual([
      { text: "Bonjour, je veux 2 pièces", arabic: false },
    ]);
  });

  it("pure Arabic is one tagged run", () => {
    expect(splitArabicRuns("السلام عليكم، أريد حذاء")).toEqual([
      { text: "السلام عليكم، أريد حذاء", arabic: true },
    ]);
  });

  it("Latin first and Arabic words after: the Arabic words are tagged, the Latin is not", () => {
    expect(splitArabicRuns("Nike حذاء رياضي")).toEqual([
      { text: "Nike ", arabic: false },
      { text: "حذاء رياضي", arabic: true },
    ]);
  });

  it("a few Arabic words at the end of a long Latin line are still tagged", () => {
    const runs = splitArabicRuns("Bonjour je voudrais commander ce modèle s'il vous plaît مرحبا");
    expect(runs.at(-1)).toEqual({ text: "مرحبا", arabic: true });
    expect(runs.filter((run) => run.arabic)).toHaveLength(1);
  });

  it("mixed text alternates and every run keeps its own script", () => {
    expect(splitArabicRuns("اختر size M من القائمة")).toEqual([
      { text: "اختر", arabic: true },
      { text: " size M ", arabic: false },
      { text: "من القائمة", arabic: true },
    ]);
  });

  it("digits and signs between two Arabic words stay inside the run", () => {
    expect(splitArabicRuns("سعره 2500 دج")).toEqual([{ text: "سعره 2500 دج", arabic: true }]);
  });

  it("a comma after an Arabic word does not pull the Latin word after it in", () => {
    expect(splitArabicRuns("مرحبا, hello")).toEqual([
      { text: "مرحبا", arabic: true },
      { text: ", hello", arabic: false },
    ]);
  });

  it("digits only, Latin or Arabic-Indic, have nothing to tag", () => {
    expect(splitArabicRuns("0555 12 34 56")).toEqual([{ text: "0555 12 34 56", arabic: false }]);
    expect(splitArabicRuns("٠٥٥٥ ١٢ ٣٤")).toEqual([{ text: "٠٥٥٥ ١٢ ٣٤", arabic: false }]);
  });

  it("the stretching stroke and the vowel marks stay with their word", () => {
    expect(splitArabicRuns("كـتـاب")).toEqual([{ text: "كـتـاب", arabic: true }]);
    expect(splitArabicRuns("مَرْحَبًا")).toEqual([{ text: "مَرْحَبًا", arabic: true }]);
  });

  it("nothing in, nothing out", () => {
    expect(splitArabicRuns("")).toEqual([]);
  });

  const samples: string[] = [
    "Nike حذاء رياضي 👟",
    "سطر أول\nline two\r\nسطر ثالث",
    "  leading and trailing  مرحبا  ",
    "\u200Fمرحبا\u200E hello",
    "😀😀",
  ];
  for (const sample of samples) {
    it(`joins back to the same text: ${JSON.stringify(sample)}`, () => {
      expect(joined(splitArabicRuns(sample))).toBe(sample);
    });
  }

  it("a very long line is cut at once", () => {
    const long = `${"ا".repeat(20_000)}${" ".repeat(20_000)}${"x".repeat(20_000)}`;
    const started = Date.now();
    const runs = splitArabicRuns(long);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(joined(runs)).toBe(long);
  });
});

describe("hasArabic", () => {
  const cases: Array<[string, boolean]> = [
    ["Nike حذاء", true],
    ["Nike shoes", false],
    ["0555 12 34 56", false],
    ["", false],
  ];
  for (const [text, expected] of cases) {
    it(`${JSON.stringify(text)} is ${expected}`, () => {
      expect(hasArabic(text)).toBe(expected);
    });
  }
});
