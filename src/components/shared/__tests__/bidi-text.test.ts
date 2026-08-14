import { describe, expect, it } from "vitest";

import { segmentBidiNumericRanges } from "@/components/shared/bidi-text";

describe("bidi numeric-range isolation", () => {
  it("isolates percentage ranges without changing surrounding Arabic copy", () => {
    expect(
      segmentBidiNumericRanges(
        "المقياس الأول للدفع عند الاستلام. متوسط القطاع 25-40%، الأفضل 8-15%.",
      ),
    ).toEqual([
      {
        text: "المقياس الأول للدفع عند الاستلام. متوسط القطاع ",
        isolate: false,
      },
      { text: "25-40%", isolate: true },
      { text: "، الأفضل ", isolate: false },
      { text: "8-15%", isolate: true },
      { text: ".", isolate: false },
    ]);
  });

  it("supports Arabic-script digits and percent signs", () => {
    expect(segmentBidiNumericRanges("النطاق ٢٥–٤٠٪ فقط")).toEqual([
      { text: "النطاق ", isolate: false },
      { text: "٢٥–٤٠٪", isolate: true },
      { text: " فقط", isolate: false },
    ]);
  });

  it("leaves ordinary translated copy untouched", () => {
    expect(segmentBidiNumericRanges("لا توجد بيانات كافية")).toEqual([
      { text: "لا توجد بيانات كافية", isolate: false },
    ]);
  });
});
