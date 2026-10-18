/**
 * Route-level tests for the import hygiene fixes (S03c-13, S03c-14, S03c-16).
 * The database layer is replaced by spies, so these run without Prisma:
 *  - the customer import preview uses the same schema as the commit;
 *  - a failed commit row carries a constant message and code, never raw text;
 *  - every committed import writes an audit row with counts and field names;
 *  - re-importing an expenses file does not double the money rows.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

import { ConflictError } from "@/types/errors";

const h = vi.hoisted(() => ({
  logAudit: vi.fn(async (..._args: unknown[]) => undefined),
  warn: vi.fn((..._args: unknown[]) => undefined),
  customerCreate: vi.fn(async (..._args: unknown[]) => ({ id: "c1" })),
  expenseFindMany: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
  expenseCreateMany: vi.fn(async (..._args: unknown[]) => ({ count: 0 })),
}));

vi.mock("@/lib/db", () => ({
  db: { expense: { findMany: h.expenseFindMany, createMany: h.expenseCreateMany } },
  shopContext: { shopId: "default" },
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => ({ actor: { kind: "person" }, shop: { shopId: "default" } })),
}));
vi.mock("@/lib/identity/authorization", () => ({
  trustedActorAuditIdentity: () => "person:test",
}));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/i18n-server", () => ({
  getI18n: async () => ({ t: (key: string) => key, locale: "en" }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/data", () => ({
  customerService: { create: h.customerCreate },
  productService: {},
}));

import { POST as importCustomers } from "../customers/route";
import { POST as importExpenses } from "../expenses/route";

type Handler = (req: NextRequest) => Promise<Response>;

function uploadRequest(path: string, csv: string, commit: boolean): NextRequest {
  const form = new FormData();
  form.set("file", new File([csv], "upload.csv", { type: "text/csv" }));
  form.set("commit", commit ? "true" : "false");
  return new NextRequest(`http://localhost${path}`, { method: "POST", body: form });
}

async function run(handler: unknown, req: NextRequest): Promise<Record<string, unknown>> {
  const response = await (handler as Handler)(req);
  return (await response.json()) as Record<string, unknown>;
}

function auditEntries(): Array<{ action: string; after: Record<string, unknown> }> {
  return h.logAudit.mock.calls.map(
    (call) => call[1] as unknown as { action: string; after: Record<string, unknown> },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.customerCreate.mockResolvedValue({ id: "c1" });
  h.expenseFindMany.mockResolvedValue([]);
  h.expenseCreateMany.mockResolvedValue({ count: 0 });
});

const CUSTOMERS_CSV = [
  "name,phone,wilaya",
  "Amine,0555123456,Alger",
  "Bad Phone,123,Alger",
  "Plus,+213 661 23 45 67,Oran",
].join("\n");

describe("customer import preview matches the commit schema (S03c-13)", () => {
  it("flags a row the commit would reject", async () => {
    const body = await run(
      importCustomers,
      uploadRequest("/api/import/customers", CUSTOMERS_CSV, false),
    );
    expect(body.validCount).toBe(2);
    expect(body.invalidCount).toBe(1);
  });
});

describe("customer import commit (S03c-13, S03c-14, S03c-16)", () => {
  const ONE_ROW = "name,phone\nAmine,0555123456\n";

  it("never returns raw driver text for a failed row", async () => {
    h.customerCreate.mockRejectedValueOnce(
      new Error("Invalid `prisma.customer.create()` invocation: Unique constraint failed on the fields: (`phone`)"),
    );
    const body = await run(importCustomers, uploadRequest("/api/import/customers", ONE_ROW, true));
    const errors = body.errors as Array<{ error: string; code: string }>;
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).not.toMatch(/prisma|unique constraint|invocation/i);
    expect(errors[0]?.code).toBe("IMPORT_ROW_FAILED");
  });

  it("returns a constant coded message for a conflict, without the phone number", async () => {
    h.customerCreate.mockRejectedValueOnce(
      new ConflictError("Customer with phone 0555123456 already exists"),
    );
    const body = await run(importCustomers, uploadRequest("/api/import/customers", ONE_ROW, true));
    const errors = body.errors as Array<{ error: string; code: string }>;
    expect(errors[0]?.code).toBe("CONFLICT");
    expect(JSON.stringify(errors)).not.toContain("0555123456");
    expect(JSON.stringify(h.warn.mock.calls)).not.toContain("0555123456");
  });

  it("audits the commit with counts and field names only", async () => {
    const body = await run(importCustomers, uploadRequest("/api/import/customers", ONE_ROW, true));
    expect(body.inserted).toBe(1);
    const entry = auditEntries().find((e) => e.action === "import.customers");
    expect(entry).toBeDefined();
    expect(entry?.after).toMatchObject({
      entity: "customers",
      totalRows: 1,
      inserted: 1,
      failed: 0,
      fieldNames: ["name", "phone"],
    });
    const text = JSON.stringify(entry);
    expect(text).not.toContain("Amine");
    expect(text).not.toContain("0555123456");
  });

  it("does not audit a preview", async () => {
    await run(importCustomers, uploadRequest("/api/import/customers", ONE_ROW, false));
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});

const EXPENSES_CSV = [
  "date,category,description,amount",
  "2026-10-01,ads,facebook,5000",
  "2026-10-02,rent,,20000",
].join("\n");

const STORED_EXPENSES = [
  { date: new Date("2026-10-01T00:00:00.000Z"), category: "ads", amount: 5000, notes: "facebook" },
  { date: new Date("2026-10-02T00:00:00.000Z"), category: "rent", amount: 20000, notes: "" },
];

describe("expenses import is idempotent (S03c-16)", () => {
  it("imports a new file once", async () => {
    const body = await run(importExpenses, uploadRequest("/api/import/expenses", EXPENSES_CSV, true));
    expect(h.expenseCreateMany).toHaveBeenCalledTimes(1);
    expect(body.inserted).toBe(2);
    expect(body.skipped).toBe(0);
  });

  it("does not double the rows when the same file is imported again", async () => {
    h.expenseFindMany.mockResolvedValue(STORED_EXPENSES);
    const body = await run(importExpenses, uploadRequest("/api/import/expenses", EXPENSES_CSV, true));
    expect(h.expenseCreateMany).not.toHaveBeenCalled();
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(2);
  });

  it("imports only the new lines of a partly known file", async () => {
    h.expenseFindMany.mockResolvedValue([STORED_EXPENSES[0]]);
    const body = await run(importExpenses, uploadRequest("/api/import/expenses", EXPENSES_CSV, true));
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(1);
    const call = h.expenseCreateMany.mock.calls[0]?.[0] as { data: Array<{ category: string }> };
    expect(call.data.map((row) => row.category)).toEqual(["rent"]);
  });

  it("keeps two identical lines of one file on a first import", async () => {
    const twice = "date,category,description,amount\n2026-10-01,packaging,boxes,800\n2026-10-01,packaging,boxes,800\n";
    const body = await run(importExpenses, uploadRequest("/api/import/expenses", twice, true));
    expect(body.inserted).toBe(2);
  });

  it("audits the commit with counts and field names only", async () => {
    h.expenseFindMany.mockResolvedValue(STORED_EXPENSES);
    await run(importExpenses, uploadRequest("/api/import/expenses", EXPENSES_CSV, true));
    const entry = auditEntries().find((e) => e.action === "import.expenses");
    expect(entry?.after).toMatchObject({
      entity: "expenses",
      totalRows: 2,
      inserted: 0,
      skipped: 2,
      failed: 0,
    });
    expect(JSON.stringify(entry)).not.toContain("facebook");
  });
});
