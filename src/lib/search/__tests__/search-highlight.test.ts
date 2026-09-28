import { describe, expect, it } from "vitest";

import { searchHighlightRanges } from "@/lib/search/search-highlight";

function marked(text: string, query: string): string {
  let output = "";
  let cursor = 0;
  for (const [start, end] of searchHighlightRanges(text, query)) {
    output += `${text.slice(cursor, start)}[${text.slice(start, end)}]`;
    cursor = end;
  }
  return output + text.slice(cursor);
}

describe("search highlight ranges", () => {
  it("highlights case-insensitive prefixes and inner matches", () => {
    expect(marked("Ahmed Benali", "ahmed b")).toBe("[Ahmed] [B]enali");
    expect(marked("Power Bank 20000mAh", "bank")).toBe("Power [Bank] 20000mAh");
  });

  it("is accent-insensitive and maps back to the source characters", () => {
    expect(marked("Miroir Mural Décoratif", "decor")).toBe(
      "Miroir Mural [Décor]atif",
    );
  });

  it("treats Arabic-Indic digits like the ranking authority", () => {
    expect(marked("0555123456", "٠٥٥٥")).toBe("[0555]123456");
  });

  it("ignores Arabic diacritics and tatweel in the source", () => {
    expect(marked("مُحمّد", "محمد")).toBe("[مُحمّد]");
    expect(marked("طــلب", "طلب")).toBe("[طــلب]");
  });

  it("merges overlapping token hits and returns nothing for no match", () => {
    expect(marked("ORD-0047", "ord ord-0")).toBe("[ORD-0]047");
    expect(searchHighlightRanges("Sara Benyahia", "xyz")).toEqual([]);
    expect(searchHighlightRanges("", "sara")).toEqual([]);
    expect(searchHighlightRanges("Sara", "  ")).toEqual([]);
  });
});
