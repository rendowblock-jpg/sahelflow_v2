import "server-only";

/**
 * Import engine — parse CSV/XLSX, map columns, validate, batch-insert.
 *
 * Generic over the entity type (products, customers, etc.). The caller provides:
 *   - A column-mapping config (expected fields + which source columns map to them)
 *   - A Zod schema for validation
 *   - An insert function (batch)
 *
 * Flow:
 *   1. parseFile() → rows as Record<string, string>[]
 *   2. mapRows() → apply column mapping → typed objects
 *   3. validateRows() → Zod parse each row → { valid, invalid }
 *   4. batchInsert() → call the insert function in chunks
 *
 * The API routes handle file upload + return a preview (parsed + mapped +
 * validated, not yet inserted). The client reviews the preview, adjusts the
 * column mapping if needed, then POSTs to commit.
 */

import Papa from "papaparse";
// Use @e965/xlsx (community-maintained fork) instead of the original `xlsx`
// package — the original is frozen at 0.18.5 on npm with known CVEs
// (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS). The fork is
// API-compatible. See https://github.com/SheetJS/sheetjs/issues
import * as XLSX from "@e965/xlsx";
import { z } from "zod";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export interface MappedRow<T> {
  rowIndex: number;
  data: T;
}

export interface ValidationFailure {
  rowIndex: number;
  errors: string[];
}

export interface ValidationResult<T> {
  valid: MappedRow<T>[];
  invalid: ValidationFailure[];
}

export interface BatchInsertResult {
  inserted: number;
  errors: Array<{ rowIndex: number; error: string }>;
}

/** Parse a CSV or XLSX file (as ArrayBuffer) into rows. */
export function parseFile(
  data: ArrayBuffer,
  filename: string,
): ParsedFile {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "csv" || ext === "txt") {
    const text = new TextDecoder().decode(data);
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (h) => h.trim(),
    });
    return {
      headers: result.meta.fields ?? [],
      rows: result.data,
    };
  }

  if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("Le fichier XLSX ne contient aucune feuille.");
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error("La feuille est vide.");
    }
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    if (json.length === 0) {
      return { headers: [], rows: [] };
    }
    const headers = Object.keys(json[0]!).map((h) => h.trim());
    const rows = json.map((r) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        out[k.trim()] = String(v ?? "");
      }
      return out;
    });
    return { headers, rows };
  }

  throw new Error(`Format de fichier non supporté: .${ext}. Utilisez CSV ou XLSX.`);
}

/** Column mapping: source column name → target field name. */
export type ColumnMapping = Record<string, string>;

/**
 * Map parsed rows to typed objects using a column mapping.
 * Only fields present in the mapping are extracted; others are ignored.
 */
export function mapRows<T>(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): Array<{ rowIndex: number; data: Partial<T> }> {
  return rows.map((row, i) => {
    const data: Record<string, string> = {};
    for (const [sourceCol, targetField] of Object.entries(mapping)) {
      const value = row[sourceCol];
      if (value !== undefined) {
        data[targetField] = value;
      }
    }
    return { rowIndex: i, data: data as Partial<T> };
  });
}

/**
 * Validate mapped rows against a Zod schema.
 * Returns valid + invalid arrays (invalid rows keep their errors).
 */
export function validateRows<T>(
  rows: Array<{ rowIndex: number; data: Partial<T> }>,
  schema: z.ZodType<T>,
): ValidationResult<T> {
  const valid: MappedRow<T>[] = [];
  const invalid: ValidationFailure[] = [];

  for (const row of rows) {
    const result = schema.safeParse(row.data);
    if (result.success) {
      valid.push({ rowIndex: row.rowIndex, data: result.data });
    } else {
      invalid.push({
        rowIndex: row.rowIndex,
        errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
  }

  return { valid, invalid };
}

/**
 * Batch-insert validated rows in chunks. Calls the insertFn for each chunk.
 * The insertFn receives the full MappedRow[] (so it can access rowIndex for
 * error reporting) and returns a count + optional per-row errors.
 * Collects per-row errors without failing the whole batch.
 */
export async function batchInsert<T>(
  rows: MappedRow<T>[],
  insertFn: (chunk: MappedRow<T>[]) => Promise<{ inserted: number; errors?: Array<{ rowIndex: number; error: string }> }>,
  chunkSize = 50,
): Promise<BatchInsertResult> {
  let inserted = 0;
  const errors: Array<{ rowIndex: number; error: string }> = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    try {
      const result = await insertFn(chunk);
      inserted += result.inserted;
      if (result.errors) {
        errors.push(...result.errors);
      }
    } catch (err) {
      // Whole chunk failed — record each row
      for (const row of chunk) {
        errors.push({
          rowIndex: row.rowIndex,
          error: err instanceof Error ? err.message : "Erreur d'insertion",
        });
      }
    }
  }

  return { inserted, errors };
}

/**
 * Auto-detect a column mapping by fuzzy-matching source headers to expected
 * fields. Returns the best-guess mapping (the user can adjust in the UI).
 */
export function autoDetectMapping(
  sourceHeaders: string[],
  expectedFields: Array<{ key: string; aliases: string[] }>,
): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = sourceHeaders.map((h) => h.toLowerCase().trim());

  for (const field of expectedFields) {
    const allAliases = [field.key.toLowerCase(), ...field.aliases.map((a) => a.toLowerCase())];
    for (const alias of allAliases) {
      const matchIdx = normalizedHeaders.findIndex((h) => h === alias || h.includes(alias));
      if (matchIdx >= 0) {
        mapping[sourceHeaders[matchIdx]!] = field.key;
        break;
      }
    }
  }

  return mapping;
}
