/**
 * Import engine tests — CSV/XLSX parsing, column mapping, Zod validation,
 * batch insertion, and auto-detect-mapping.
 *
 * The engine functions are pure (no DB) — they take an ArrayBuffer / rows
 * and return parsed/mapped/validated structures.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import * as XLSX from "@e965/xlsx";
import {
  parseFile,
  mapRows,
  validateRows,
  batchInsert,
  autoDetectMapping,
  type MappedRow,
} from "../engine";

// ── parseFile (CSV) ─────────────────────────────────────────────────────────

describe("parseFile — CSV", () => {
  function csvBuffer(text: string): ArrayBuffer {
    // Buffer.from(string) for small strings returns a view into the Node.js
    // Buffer pool, so `.buffer.slice(0, N)` would return the FIRST N bytes of
    // the pool (not the bytes for `text`). Copy into a fresh ArrayBuffer so
    // TextDecoder sees exactly the bytes of `text`.
    const buf = Buffer.from(text, "utf-8");
    const out = new ArrayBuffer(buf.byteLength);
    new Uint8Array(out).set(buf);
    return out;
  }

  it("parses a simple CSV with headers + rows", () => {
    const csv = "name,phone,total\nAhmed,0555123456,5000\nFatima,0666123456,3000\n";
    const result = parseFile(csvBuffer(csv), "customers.csv");
    expect(result.headers).toEqual(["name", "phone", "total"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.name).toBe("Ahmed");
    expect(result.rows[0]!.phone).toBe("0555123456");
    expect(result.rows[0]!.total).toBe("5000");
  });

  it("trims header whitespace", () => {
    const csv = "  name  ,  phone  \nAhmed,0555123456\n";
    const result = parseFile(csvBuffer(csv), "x.csv");
    expect(result.headers).toEqual(["name", "phone"]);
  });

  it("skips empty lines", () => {
    const csv = "name,phone\n\nAhmed,0555123456\n\n";
    const result = parseFile(csvBuffer(csv), "x.csv");
    expect(result.rows).toHaveLength(1);
  });

  it("treats .txt as CSV", () => {
    const csv = "a,b\n1,2\n";
    const result = parseFile(csvBuffer(csv), "data.txt");
    expect(result.headers).toEqual(["a", "b"]);
    expect(result.rows).toHaveLength(1);
  });

  it("returns an empty rows array for an empty body", () => {
    const csv = "name,phone\n";
    const result = parseFile(csvBuffer(csv), "x.csv");
    expect(result.headers).toEqual(["name", "phone"]);
    expect(result.rows).toHaveLength(0);
  });
});

// ── parseFile (XLSX) ────────────────────────────────────────────────────────

describe("parseFile — XLSX", () => {
  function xlsxBuffer(rows: Record<string, unknown>[]): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  }

  it("parses an XLSX with headers + rows", () => {
    const buf = xlsxBuffer([
      { name: "Ahmed", phone: "0555123456", total: 5000 },
      { name: "Fatima", phone: "0666123456", total: 3000 },
    ]);
    const result = parseFile(buf, "data.xlsx");
    expect(result.headers).toContain("name");
    expect(result.headers).toContain("phone");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.name).toBe("Ahmed");
    expect(result.rows[0]!.total).toBe("5000"); // stringified
  });

  it("treats .xls as XLSX", () => {
    const buf = xlsxBuffer([{ a: 1 }]);
    const result = parseFile(buf, "data.xls");
    expect(result.rows).toHaveLength(1);
  });
});

// ── parseFile (errors) ──────────────────────────────────────────────────────

describe("parseFile — errors", () => {
  it("throws on unsupported file extension", () => {
    const buf = new ArrayBuffer(0);
    expect(() => parseFile(buf, "data.json")).toThrow(/non supporté/i);
  });
});

// ── mapRows ─────────────────────────────────────────────────────────────────

describe("mapRows", () => {
  it("maps source columns to target fields via the mapping", () => {
    const rows = [
      { Nom: "Ahmed", Telephone: "0555123456", Ignored: "x" },
      { Nom: "Fatima", Telephone: "0666123456", Ignored: "y" },
    ];
    const mapping = { Nom: "name", Telephone: "phone" };
    const mapped = mapRows(rows, mapping);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]!.rowIndex).toBe(0);
    expect(mapped[0]!.data).toEqual({ name: "Ahmed", phone: "0555123456" });
    expect(mapped[1]!.data).toEqual({ name: "Fatima", phone: "0666123456" });
  });

  it("ignores source columns not in the mapping", () => {
    const rows = [{ a: "1", b: "2", c: "3" }];
    const mapped = mapRows(rows, { a: "x" });
    expect(mapped[0]!.data).toEqual({ x: "1" });
  });

  it("omits target fields when the source column is missing in a row", () => {
    const rows: Record<string, string>[] = [{ a: "1" }, { a: "1", b: "2" }];
    const mapped = mapRows(rows, { a: "x", b: "y" });
    expect(mapped[0]!.data).toEqual({ x: "1" });
    expect(mapped[1]!.data).toEqual({ x: "1", y: "2" });
  });

  it("preserves rowIndex (0-based)", () => {
    const rows = [{ a: "1" }, { a: "2" }, { a: "3" }];
    const mapped = mapRows(rows, { a: "x" });
    expect(mapped.map((m) => m.rowIndex)).toEqual([0, 1, 2]);
  });
});

// ── validateRows ────────────────────────────────────────────────────────────

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
});

describe("validateRows", () => {
  it("returns all rows in `valid` when they all pass", () => {
    const rows = [
      { rowIndex: 0, data: { name: "Ahmed", phone: "0555123456" } },
      { rowIndex: 1, data: { name: "Fatima", phone: "0666123456" } },
    ];
    const result = validateRows(rows, customerSchema);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
    expect(result.valid[0]!.data.name).toBe("Ahmed");
  });

  it("moves invalid rows to `invalid` with error messages", () => {
    const rows = [
      { rowIndex: 0, data: { name: "", phone: "0555123456" } }, // empty name
      { rowIndex: 1, data: { name: "Fatima", phone: "123" } }, // short phone
    ];
    const result = validateRows(rows, customerSchema);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(2);
    expect(result.invalid[0]!.rowIndex).toBe(0);
    expect(result.invalid[0]!.errors.length).toBeGreaterThan(0);
    expect(result.invalid[0]!.errors[0]).toContain("name");
  });

  it("separates valid + invalid rows (mixed)", () => {
    const rows = [
      { rowIndex: 0, data: { name: "Ahmed", phone: "0555123456" } },
      { rowIndex: 1, data: { name: "", phone: "x" } },
      { rowIndex: 2, data: { name: "Sara", phone: "0777123456" } },
    ];
    const result = validateRows(rows, customerSchema);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]!.rowIndex).toBe(1);
  });

  it("returns empty arrays for empty input", () => {
    const result = validateRows([], customerSchema);
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
  });
});

// ── batchInsert ─────────────────────────────────────────────────────────────

describe("batchInsert", () => {
  function makeRows(n: number): MappedRow<Record<string, string>>[] {
    return Array.from({ length: n }, (_, i) => ({
      rowIndex: i,
      data: { name: `item-${i}` },
    }));
  }

  it("calls insertFn once when rows fit in a single chunk", async () => {
    const insertFn = vi.fn(async () => ({ inserted: 5 }));
    const result = await batchInsert(makeRows(5), insertFn, 50);
    expect(insertFn).toHaveBeenCalledTimes(1);
    expect(result.inserted).toBe(5);
    expect(result.errors).toEqual([]);
  });

  it("chunks rows by chunkSize and sums inserted counts", async () => {
    const insertFn = vi.fn(async (chunk: MappedRow<unknown>[]) => ({
      inserted: chunk.length,
    }));
    const result = await batchInsert(makeRows(7), insertFn, 3);
    // 7 rows / chunkSize 3 = 3 chunks (3 + 3 + 1)
    expect(insertFn).toHaveBeenCalledTimes(3);
    expect(result.inserted).toBe(7);
  });

  it("collects per-row errors from insertFn", async () => {
    const insertFn = vi.fn(async (chunk: MappedRow<unknown>[]) => ({
      inserted: 0,
      errors: chunk.map((r) => ({ rowIndex: r.rowIndex, error: "duplicate" })),
    }));
    const result = await batchInsert(makeRows(3), insertFn, 50);
    expect(result.inserted).toBe(0);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]!.error).toBe("duplicate");
  });

  it("records per-row errors when insertFn throws (whole chunk fails)", async () => {
    const insertFn = vi.fn(async () => {
      throw new Error("DB connection lost");
    });
    const result = await batchInsert(makeRows(3), insertFn, 50);
    expect(result.inserted).toBe(0);
    expect(result.errors).toHaveLength(3);
    for (const e of result.errors) expect(e.error).toBe("DB connection lost");
  });

  it("uses default chunkSize of 50 when not specified", async () => {
    const insertFn = vi.fn(async (chunk: MappedRow<unknown>[]) => ({
      inserted: chunk.length,
    }));
    const rows = makeRows(120);
    await batchInsert(rows, insertFn);
    // 120 / 50 = 3 chunks (50 + 50 + 20)
    expect(insertFn).toHaveBeenCalledTimes(3);
  });

  it("returns inserted=0 + no errors for empty input", async () => {
    const insertFn = vi.fn(async () => ({ inserted: 0 }));
    const result = await batchInsert([], insertFn, 50);
    expect(insertFn).not.toHaveBeenCalled();
    expect(result.inserted).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

// ── autoDetectMapping ───────────────────────────────────────────────────────

describe("autoDetectMapping", () => {
  it("maps by exact alias match (case-insensitive)", () => {
    const headers = ["Nom", "Téléphone", "Montant"];
    const fields = [
      { key: "name", aliases: ["nom", "name"] },
      { key: "phone", aliases: ["telephone", "téléphone", "phone"] },
      { key: "total", aliases: ["montant", "total"] },
    ];
    const mapping = autoDetectMapping(headers, fields);
    expect(mapping["Nom"]).toBe("name");
    expect(mapping["Téléphone"]).toBe("phone");
    expect(mapping["Montant"]).toBe("total");
  });

  it("maps by partial match when no exact match exists", () => {
    const headers = ["Customer Name", "Phone Number"];
    const fields = [
      { key: "name", aliases: ["nom"] },
      { key: "phone", aliases: ["tel"] },
    ];
    const mapping = autoDetectMapping(headers, fields);
    // "Customer Name" includes "nom" → name
    expect(mapping["Customer Name"]).toBe("name");
  });

  it("maps by the field key itself (lowercased)", () => {
    const headers = ["name", "phone"];
    const fields = [
      { key: "name", aliases: [] },
      { key: "phone", aliases: [] },
    ];
    const mapping = autoDetectMapping(headers, fields);
    expect(mapping["name"]).toBe("name");
    expect(mapping["phone"]).toBe("phone");
  });

  it("omits fields that have no matching header", () => {
    const headers = ["name"];
    const fields = [
      { key: "name", aliases: ["nom"] },
      { key: "phone", aliases: ["tel"] },
    ];
    const mapping = autoDetectMapping(headers, fields);
    expect(mapping["name"]).toBe("name");
    expect(mapping["phone"]).toBeUndefined();
  });

  it("returns an empty object when nothing matches", () => {
    const mapping = autoDetectMapping(["foo", "bar"], [
      { key: "name", aliases: ["nom"] },
    ]);
    expect(mapping).toEqual({});
  });

  it("uses the first match (priority by field order, alias order)", () => {
    const headers = ["phone number"];
    const fields = [
      { key: "phone", aliases: ["tel", "phone"] },
    ];
    const mapping = autoDetectMapping(headers, fields);
    expect(mapping["phone number"]).toBe("phone");
  });
});
