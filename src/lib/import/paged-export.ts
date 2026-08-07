import "server-only";

export interface ExportColumn<Row extends Record<string, unknown>> {
  key: string;
  label: string;
  format?: (value: unknown, row: Row) => string;
}

export type ExportPageLoader<Row extends Record<string, unknown>> = (
  take: number,
  skip: number,
) => Promise<Row[]>;

export const DEFAULT_EXPORT_PAGE_SIZE = 500;
export const MAX_XLSX_EXPORT_ROWS = 10_000;

function escapeField(value: string): string {
  const sanitized = /^[=+@\t\r-]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function rowLine<Row extends Record<string, unknown>>(
  row: Row,
  columns: readonly ExportColumn<Row>[],
): string {
  return columns
    .map((column) => {
      const value = row[column.key];
      const formatted = column.format
        ? column.format(value, row)
        : String(value ?? "");
      return escapeField(formatted);
    })
    .join(",");
}

/**
 * Stream a complete CSV in bounded database pages. No page or transformed-row
 * array survives after its chunk is enqueued, so very large exports remain
 * usable on the local desktop server.
 */
export function createPagedCsvStream<Row extends Record<string, unknown>>(
  columns: readonly ExportColumn<Row>[],
  loadPage: ExportPageLoader<Row>,
  pageSize = DEFAULT_EXPORT_PAGE_SIZE,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let skip = 0;
  let started = false;
  let finished = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) {
        controller.close();
        return;
      }

      if (!started) {
        started = true;
        const header = columns.map((column) => escapeField(column.label)).join(",");
        controller.enqueue(encoder.encode(`\uFEFF${header}\r\n`));
        return;
      }

      const rows = await loadPage(pageSize, skip);
      if (rows.length === 0) {
        finished = true;
        controller.close();
        return;
      }

      skip += rows.length;
      controller.enqueue(
        encoder.encode(`${rows.map((row) => rowLine(row, columns)).join("\r\n")}\r\n`),
      );
      if (rows.length < pageSize) finished = true;
    },
  });
}

/**
 * XLSX generation is inherently in-memory with the current library. Keep that
 * path explicitly bounded and direct larger exports to the complete streaming
 * CSV path instead of silently truncating or risking an OOM.
 */
export async function collectBoundedXlsxRows<
  Row extends Record<string, unknown>,
>(
  total: number,
  loadPage: ExportPageLoader<Row>,
  options: { maxRows?: number; pageSize?: number } = {},
): Promise<Row[]> {
  const maxRows = options.maxRows ?? MAX_XLSX_EXPORT_ROWS;
  const pageSize = options.pageSize ?? DEFAULT_EXPORT_PAGE_SIZE;
  if (total > maxRows) {
    throw new RangeError(
      `XLSX export is limited to ${maxRows} rows. Use CSV for the complete export.`,
    );
  }

  const rows: Row[] = [];
  for (let skip = 0; skip < total; skip += pageSize) {
    rows.push(...(await loadPage(Math.min(pageSize, total - skip), skip)));
  }
  return rows;
}
