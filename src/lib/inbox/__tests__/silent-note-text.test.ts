/**
 * The grey "last customer message" note in three languages. Arabic counts need
 * the right noun form: 3 to 10 take the plural (ساعات / أيام), 11 and up take
 * the singular (ساعة / يوماً), and exactly 2 days is the dual (يومين) with no
 * number. English and French stay as they were.
 */
import { describe, expect, it } from "vitest";
import { silentNoteText } from "@/lib/inbox/silent-note-text";

const AR = "آخر رسالة من زبون: قبل ";

describe("Arabic hours (the note appears from 6 h up to 47 h)", () => {
  const cases: Array<[number, string]> = [
    [6, `${AR}6 ساعات`],
    [7, `${AR}7 ساعات`],
    [10, `${AR}10 ساعات`],
    [11, `${AR}11 ساعة`],
    [12, `${AR}12 ساعة`],
    [24, `${AR}24 ساعة`],
    [47, `${AR}47 ساعة`],
  ];
  for (const [hours, expected] of cases) {
    it(`${hours} h`, () => expect(silentNoteText("ar", hours)).toBe(expected));
  }
});

describe("Arabic days (from 48 h)", () => {
  const cases: Array<[number, string]> = [
    [48, `${AR}يومين`],
    [71, `${AR}يومين`],
    [72, `${AR}3 أيام`],
    [240, `${AR}10 أيام`],
    [264, `${AR}11 يوماً`],
    [24 * 30, `${AR}30 يوماً`],
    [24 * 100, `${AR}100 يوماً`],
  ];
  for (const [hours, expected] of cases) {
    it(`${hours} h is ${Math.floor(hours / 24)} d`, () => expect(silentNoteText("ar", hours)).toBe(expected));
  }
});

describe("English and French are unchanged", () => {
  it("hours", () => {
    expect(silentNoteText("en", 7)).toBe("Last customer message: 7 h ago");
    expect(silentNoteText("fr", 7)).toBe("Dernier message client : il y a 7 h");
    expect(silentNoteText("en", 47)).toBe("Last customer message: 47 h ago");
  });
  it("days", () => {
    expect(silentNoteText("en", 72)).toBe("Last customer message: 3 d ago");
    expect(silentNoteText("fr", 72)).toBe("Dernier message client : il y a 3 j");
    expect(silentNoteText("en", 48)).toBe("Last customer message: 2 d ago");
  });
});

describe("no hour count leaves a placeholder or an empty note", () => {
  it("every whole hour from 6 to 3000 in all three languages", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      for (let hours = 6; hours <= 3000; hours += 1) {
        const text = silentNoteText(locale, hours);
        expect(text, `${locale} ${hours}`).not.toContain("{{");
        expect(text.length, `${locale} ${hours}`).toBeGreaterThan(10);
      }
    }
  });
});
