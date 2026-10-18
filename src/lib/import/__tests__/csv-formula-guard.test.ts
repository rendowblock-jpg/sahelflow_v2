/**
 * S03c-18: the CSV formula guard must neutralise payloads but leave strictly
 * numeric and phone-shaped values alone. Before the fix every value starting
 * with + or - got a leading apostrophe, so "+213555123456" and "-1500" were
 * written to the file as "'+213555123456" and "'-1500".
 */
import { describe, it, expect } from "vitest";

import { toCsv } from "../export";
import { createPagedCsvStream } from "../paged-export";

type Row = Record<string, unknown> & { value: string };
const columns = [{ key: "value", label: "value" }];

function csvLines(csv: string): string[] {
  return csv.split("\r\n").slice(1);
}

async function pagedCsvLines(values: string[]): Promise<string[]> {
  const rows: Row[] = values.map((value) => ({ value }));
  const stream = createPagedCsvStream(columns, async (take, skip) =>
    rows.slice(skip, skip + take),
  );
  const text = await new Response(stream).text();
  return csvLines(text.replace(/^\uFEFF/, "")).filter((line) => line !== "");
}

const LEGITIMATE = [
  "+213555123456",
  "+213 555 12 34 56",
  "-1500",
  "-12.5",
  "+0555123456",
];

const PAYLOADS = [
  { raw: '=HYPERLINK("http://evil.example","click")', out: `"'=HYPERLINK(""http://evil.example"",""click"")"` },
  { raw: "+cmd|' /C calc'!A0", out: "'+cmd|' /C calc'!A0" },
  { raw: "@SUM(1+1)", out: "'@SUM(1+1)" },
  { raw: "-2+3", out: "'-2+3" },
  { raw: "=1+1", out: "'=1+1" },
  { raw: "+1+1", out: "'+1+1" },
  { raw: "-", out: "'-" },
  { raw: "+", out: "'+" },
  { raw: "+1 +cmd", out: "'+1 +cmd" },
];

describe("CSV formula guard keeps numeric and phone values intact (S03c-18)", () => {
  it("toCsv leaves phones and negative amounts untouched", () => {
    const csv = toCsv(
      LEGITIMATE.map((value) => ({ value })),
      columns,
    );
    expect(csvLines(csv)).toEqual(LEGITIMATE);
  });

  it("the paged export stream leaves phones and negative amounts untouched", async () => {
    expect(await pagedCsvLines(LEGITIMATE)).toEqual(LEGITIMATE);
  });
});

describe("CSV formula guard still neutralises real payloads", () => {
  it.each(PAYLOADS)("toCsv neutralises $raw", ({ raw, out }) => {
    expect(csvLines(toCsv([{ value: raw }], columns))).toEqual([out]);
  });

  it.each(PAYLOADS)("the paged stream neutralises $raw", async ({ raw, out }) => {
    expect(await pagedCsvLines([raw])).toEqual([out]);
  });
});
