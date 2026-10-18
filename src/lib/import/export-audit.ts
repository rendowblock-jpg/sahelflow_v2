/**
 * Export audit payload and truncation signalling (S03c-17).
 *
 * The export audit row used to record only `{ format }`, and a filtered
 * orders export that matched more than the cap ended without a word. The
 * payload now names the entity, the NAMES of the filters that were active
 * (never their values: a search term can be a customer name or phone) and
 * the number of rows the download carries; a capped download is reported to
 * the caller through response headers.
 */

export interface ExportRowSummary {
  /** Rows matching the export scope when the export started. */
  totalMatching: number;
  /** Cap applied to this export, or undefined when it streams everything. */
  rowLimit?: number | undefined;
}

export function exportedRowCount(summary: ExportRowSummary): number {
  return summary.rowLimit === undefined
    ? summary.totalMatching
    : Math.min(summary.totalMatching, summary.rowLimit);
}

export function exportTruncated(summary: ExportRowSummary): boolean {
  return summary.rowLimit !== undefined && summary.totalMatching > summary.rowLimit;
}

/** Names of the filters that are set (truthy). Values are never recorded. */
export function activeFilterNames(filters: Record<string, unknown>): string[] {
  return Object.entries(filters)
    .filter(([, value]) => Boolean(value))
    .map(([name]) => name)
    .sort();
}

/** The `after` object of an `export.<entity>` audit row. */
export function exportAuditAfter(input: {
  entity: string;
  format: string;
  summary: ExportRowSummary;
  filterNames?: readonly string[];
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...(input.extra ?? {}),
    entity: input.entity,
    format: input.format,
    rowCount: exportedRowCount(input.summary),
    filterNames: [...(input.filterNames ?? [])],
    truncated: exportTruncated(input.summary),
  };
}

/** Response headers that tell the caller how many rows were sent and whether the cap cut the file. */
export function exportRowHeaders(summary: ExportRowSummary): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Export-Row-Count": String(exportedRowCount(summary)),
  };
  if (exportTruncated(summary)) {
    headers["X-Export-Truncated"] = "true";
    headers["X-Export-Total-Rows"] = String(summary.totalMatching);
    headers["X-Export-Row-Limit"] = String(summary.rowLimit);
  }
  return headers;
}
