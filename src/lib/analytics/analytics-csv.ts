/**
 * Analytics CSV export (R4-d) — client-side generation from loaded data.
 *
 * The analytics summary is small (KPIs + one row per courier), so the export is
 * a client-side blob download rather than a streamed API route. Quoting follows
 * the canonical export convention (src/lib/import/paged-export.ts): CSV-formula
 * injection guard, double-quote escaping, UTF-8 BOM and CRLF rows so Excel and
 * LibreOffice open the file with Arabic content intact.
 */

export interface AnalyticsCsvSection {
  /** Section heading rendered as its own single-cell row. */
  title: string;
  columns: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<string | number | null>>;
}

function escapeField(value: string): string {
  const sanitized = /^[=+@\t\r-]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function field(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return escapeField(String(value));
}

/** Render one or more labeled sections into a UTF-8 CSV document. */
export function buildAnalyticsCsv(
  sections: ReadonlyArray<AnalyticsCsvSection>,
): string {
  const lines: string[] = [];
  sections.forEach((section, index) => {
    if (index > 0) lines.push("");
    lines.push(escapeField(section.title));
    lines.push(section.columns.map((column) => escapeField(column)).join(","));
    for (const row of section.rows) {
      lines.push(row.map((cell) => field(cell)).join(","));
    }
  });
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
