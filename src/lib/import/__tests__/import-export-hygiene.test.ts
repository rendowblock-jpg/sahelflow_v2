/**
 * Pure helpers added for S03c-13/14/16/17/19 (constant row errors, expense
 * idempotency plan, export/import audit payloads, search query bounds).
 */
import { describe, it, expect } from "vitest";

import { SahelFlowError, ConflictError, ValidationError } from "@/types/errors";
import { csvEscapeField, neutralizeCsvFormula } from "../csv-field";
import { importRowError, IMPORT_ROW_FAILED_MESSAGE } from "../row-error";
import { expenseRowKey, planExpenseImport } from "../expense-dedupe";
import {
  activeFilterNames,
  exportAuditAfter,
  exportRowHeaders,
  exportedRowCount,
  exportTruncated,
} from "../export-audit";
import { importAuditAfter, importedFieldNames } from "../import-audit";
import {
  parseCustomerSearchLimit,
  parseCustomerSearchOffset,
} from "@/lib/customers/search-params";

describe("csvEscapeField (S03c-18)", () => {
  it("does not touch ordinary text, phones or negative amounts", () => {
    expect(csvEscapeField("Ahmed")).toBe("Ahmed");
    expect(csvEscapeField("0555123456")).toBe("0555123456");
    expect(csvEscapeField("+213555123456")).toBe("+213555123456");
    expect(csvEscapeField("-1500")).toBe("-1500");
  });

  it("neutralises tab and carriage-return prefixed values", () => {
    expect(neutralizeCsvFormula("\t=1+1")).toBe("'\t=1+1");
    expect(neutralizeCsvFormula("\r=1+1")).toBe("'\r=1+1");
  });

  it("quotes fields containing separators and doubles inner quotes", () => {
    expect(csvEscapeField('a,"b"')).toBe('"a,""b"""');
  });

  it("does not let a trailing newline smuggle text past the numeric rule", () => {
    expect(neutralizeCsvFormula("+213555123456\n=cmd")).toBe("'+213555123456\n=cmd");
  });
});

describe("importRowError", () => {
  it("never echoes a raw driver message", () => {
    const raw = new Error("Unique constraint failed on the fields: (`phone`) at C:\\data\\sahelflow.db");
    expect(importRowError(raw)).toEqual({
      code: "IMPORT_ROW_FAILED",
      message: IMPORT_ROW_FAILED_MESSAGE,
    });
  });

  it("maps known service errors to constant messages without their own text", () => {
    const conflict = importRowError(new ConflictError("Customer with phone 0555123456 already exists"));
    expect(conflict.code).toBe("CONFLICT");
    expect(conflict.message).not.toContain("0555123456");
    expect(importRowError(new ValidationError('[{"path":["phone"]}]')).code).toBe("VALIDATION_ERROR");
    expect(
      importRowError(new SahelFlowError("x", "CUSTOMER_PHONE_DELETED", 409)).code,
    ).toBe("CUSTOMER_PHONE_DELETED");
  });

  it("treats an unknown coded error as a generic failure", () => {
    expect(importRowError(new SahelFlowError("secret detail", "SOMETHING_ELSE", 500)).message).toBe(
      IMPORT_ROW_FAILED_MESSAGE,
    );
  });
});

describe("planExpenseImport (S03c-16)", () => {
  const row = (date: string, category: string, amount: number, description?: string) => ({
    rowIndex: 0,
    data: { date, category, amount, description },
  });
  const stored = (date: string, category: string, amount: number, notes: string | null) => ({
    date: new Date(date),
    category,
    amount,
    notes,
  });

  it("skips rows the shop already holds and keeps new ones", () => {
    const plan = planExpenseImport(
      [row("2026-10-01T00:00:00.000Z", "ads", 5000, "fb"), row("2026-10-02T00:00:00.000Z", "rent", 20000, "")],
      [stored("2026-10-01T00:00:00.000Z", "ads", 5000, "fb")],
    );
    expect(plan.skipped).toHaveLength(1);
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0]?.data.category).toBe("rent");
  });

  it("treats a null note and an empty note as the same note", () => {
    const plan = planExpenseImport(
      [row("2026-10-01T00:00:00.000Z", "ads", 5000, "")],
      [stored("2026-10-01T00:00:00.000Z", "ads", 5000, null)],
    );
    expect(plan.skipped).toHaveLength(1);
  });

  it("imports a file that legitimately lists the same line twice, once", () => {
    const line = row("2026-10-01T00:00:00.000Z", "packaging", 800, "boxes");
    const first = planExpenseImport([line, line], []);
    expect(first.toInsert).toHaveLength(2);
    const reimport = planExpenseImport(
      [line, line],
      [
        stored("2026-10-01T00:00:00.000Z", "packaging", 800, "boxes"),
        stored("2026-10-01T00:00:00.000Z", "packaging", 800, "boxes"),
      ],
    );
    expect(reimport.toInsert).toHaveLength(0);
    expect(reimport.skipped).toHaveLength(2);
  });

  it("only matches on every field", () => {
    expect(expenseRowKey({ date: "2026-10-01T00:00:00.000Z", category: "ads", amount: 1, notes: "a" })).not.toBe(
      expenseRowKey({ date: "2026-10-01T00:00:00.000Z", category: "ads", amount: 2, notes: "a" }),
    );
  });
});

describe("export audit payload (S03c-17)", () => {
  it("counts rows against the cap and flags truncation", () => {
    const capped = { totalMatching: 7000, rowLimit: 5000 };
    expect(exportedRowCount(capped)).toBe(5000);
    expect(exportTruncated(capped)).toBe(true);
    expect(exportRowHeaders(capped)).toEqual({
      "X-Export-Row-Count": "5000",
      "X-Export-Truncated": "true",
      "X-Export-Total-Rows": "7000",
      "X-Export-Row-Limit": "5000",
    });
  });

  it("does not flag an uncapped or within-cap export", () => {
    expect(exportRowHeaders({ totalMatching: 12 })).toEqual({ "X-Export-Row-Count": "12" });
    expect(exportTruncated({ totalMatching: 5000, rowLimit: 5000 })).toBe(false);
  });

  it("records filter NAMES only, never values", () => {
    const names = activeFilterNames({ q: "Ahmed 0555", wilayaCode: 16, status: undefined, dateFrom: "" });
    expect(names).toEqual(["q", "wilayaCode"]);
    const after = exportAuditAfter({
      entity: "orders",
      format: "csv",
      summary: { totalMatching: 3 },
      filterNames: names,
    });
    expect(after).toEqual({
      entity: "orders",
      format: "csv",
      rowCount: 3,
      filterNames: ["q", "wilayaCode"],
      truncated: false,
    });
    expect(JSON.stringify(after)).not.toContain("Ahmed");
  });
});

describe("import audit payload (S03c-16)", () => {
  it("keeps only known field names, never source headers or values", () => {
    const names = importedFieldNames(
      { "Client name": "name", "Tel 0555123456": "phone", secret: "not-a-field" },
      ["name", "phone", "wilaya"],
    );
    expect(names).toEqual(["name", "phone"]);
    const after = importAuditAfter({
      entity: "customers",
      totalRows: 10,
      inserted: 8,
      failed: 1,
      invalid: 1,
      mapping: { "Tel 0555123456": "phone" },
      knownFields: ["phone"],
    });
    expect(after).toMatchObject({ totalRows: 10, inserted: 8, failed: 1, invalid: 1, skipped: 0 });
    expect(JSON.stringify(after)).not.toContain("0555123456");
  });
});

describe("customer search bounds (S03c-19)", () => {
  it("falls back to defaults for missing or garbage values instead of NaN", () => {
    expect(parseCustomerSearchLimit(null)).toBe(50);
    expect(parseCustomerSearchLimit("abc")).toBe(50);
    expect(parseCustomerSearchOffset("zzz")).toBe(0);
  });

  it("clamps to the allowed range", () => {
    expect(parseCustomerSearchLimit("500")).toBe(100);
    expect(parseCustomerSearchLimit("0")).toBe(1);
    expect(parseCustomerSearchLimit("-4")).toBe(1);
    expect(parseCustomerSearchOffset("-3")).toBe(0);
    expect(parseCustomerSearchOffset("25")).toBe(25);
  });
});
