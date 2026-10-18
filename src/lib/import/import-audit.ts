/**
 * Audit payload for a committed import (S03c-16). Counts and field NAMES only:
 * never a cell value, a file name or a source header (headers are free text
 * chosen by whoever built the spreadsheet).
 */

export function importedFieldNames(
  mapping: Record<string, string>,
  knownFields: readonly string[],
): string[] {
  const known = new Set(knownFields);
  const used = new Set<string>();
  for (const [source, target] of Object.entries(mapping)) {
    if (known.has(target)) used.add(target);
    else if (known.has(source)) used.add(source);
  }
  return [...used].sort();
}

export function importAuditAfter(input: {
  entity: string;
  totalRows: number;
  inserted: number;
  failed: number;
  invalid?: number;
  skipped?: number;
  mapping: Record<string, string>;
  knownFields: readonly string[];
}): Record<string, unknown> {
  return {
    entity: input.entity,
    totalRows: input.totalRows,
    inserted: input.inserted,
    failed: input.failed,
    invalid: input.invalid ?? 0,
    skipped: input.skipped ?? 0,
    fieldNames: importedFieldNames(input.mapping, input.knownFields),
  };
}
