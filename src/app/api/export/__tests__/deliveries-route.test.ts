import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/export/deliveries downloads the seller's deliveries as a CSV (streamed) or an XLSX file. Each row carries
// customer data (name, phone, wilaya, commune), so what matters is: only a person who holds all four permissions gets
// in; the audit entry is written BEFORE any row leaves and never holds row data; only the listed fields are read from
// the database and soft-deleted rows are left out; the CSV neutralises spreadsheet formulas; the paging reads every
// row once; the XLSX is refused above 10,000 rows; and the headers say how many rows the file carries.
//
// Real code under test: the route, withErrorHandler (so the status and body of each refusal are the real ones),
// NextResponse, the CSV stream and escaper (paged-export, csv-field), the export audit payload and headers
// (export-audit), the delivery status key helper, intlLocale, SahelFlowError and the Phase 2 permission catalog and
// role table. Stand-ins: the identity layer (requireAuth, trusted-actor identity), the audit writer, the database
// (count and findMany on the delivery table, answered from an array that honours take and skip), the translation
// function (it returns the key, so a label shows which key the route asked for), the XLSX writer (toXlsx: it receives
// the rows and columns and returns fixed bytes, so the spreadsheet file format is NOT tested) and the logger/monitoring
// hooks withErrorHandler calls (its shop-authority and licence hooks only run when NODE_ENV is production, so those two
// mocks are inert here and the production checks that run before requireAuth are NOT tested).
const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  auditIdentity: vi.fn(),
  logAudit: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  toXlsx: vi.fn(),
  getI18n: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: h.auditIdentity }));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/i18n-server", () => ({ getI18n: h.getI18n }));
vi.mock("@/lib/import/export", () => ({ toXlsx: h.toXlsx }));
vi.mock("@/lib/db", () => ({
  db: { delivery: { count: h.count, findMany: h.findMany } },
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: h.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import * as route from "@/app/api/export/deliveries/route";
import { db, shopContext } from "@/lib/db";
import {
  PHASE2_ACTIONS,
  getPhase2PresetPermissions,
  hasPhase2Permission,
  type Phase2Action,
} from "@/lib/identity/permissions";
import { intlLocale } from "@/lib/utils";
import { SahelFlowError } from "@/types/errors";

const { GET } = route;

const PERMISSIONS = ["data.export", "deliveries.read", "customers.contact.read", "orders.financials.read"];
const ACTOR = { kind: "person" as const, personId: "5".repeat(32), role: "owner" as const };
// The real trustedActorAuditIdentity returns a string such as person:<id>.
const AUDIT_ACTOR = `person:${"5".repeat(32)}`;
const TODAY = "2026-10-21";
const BOM = "\uFEFF";
const LABEL_KEYS = [
  "export.deliveries.tracking",
  "export.deliveries.provider",
  "export.deliveries.orderNumber",
  "export.deliveries.customer",
  "export.deliveries.phone",
  "export.deliveries.wilaya",
  "export.deliveries.commune",
  "export.deliveries.status",
  "export.deliveries.cost",
  "export.deliveries.date",
];
const COLUMN_KEYS = [
  "trackingNumber",
  "provider",
  "orderNumber",
  "customerName",
  "phone",
  "wilaya",
  "commune",
  "status",
  "cost",
  "createdAt",
];
const XLSX_BYTES = new Uint8Array([80, 75, 3, 4, 9, 9]);
const SECRET_IN_ERROR = "SECRET-DB-PASSWORD-0003";

type Row = ReturnType<typeof delivery>;

function delivery(i: number, over: Record<string, unknown> = {}) {
  return {
    trackingNumber: `YAL-${String(i).padStart(5, "0")}` as string | null,
    provider: "yalidine",
    status: "pending",
    cost: 450 as number | null,
    createdAt: new Date(Date.UTC(2026, 9, 21, 10, 0, 0) + i * 1000),
    order: {
      orderNumber: `ORD-${i}`,
      phone: "+213555123456",
      wilaya: "16",
      commune: "Bab El Oued",
      customer: { name: "Amine B." } as { name: string } | null,
    },
    ...over,
  };
}

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => delivery(i + 1));
}

/** Makes the database stand-in answer from an array, honouring take and skip like the real query. */
function serve(all: Row[]): void {
  h.count.mockResolvedValue(all.length);
  let reads = 0;
  h.findMany.mockImplementation(async (args: { take: number; skip: number }) => {
    // A paging bug that never advances would otherwise loop until the test times out.
    if (++reads > 50) throw new Error("paging did not advance: more than 50 page reads");
    return all.slice(args.skip, args.skip + args.take);
  });
}

function get(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/export/deliveries${query}`, { method: "GET" });
}

function firstCall(spy: { mock: { calls: unknown[][] } }): unknown[] {
  const first = spy.mock.calls[0];
  if (!first) throw new Error("the stand-in was never called");
  return first;
}

function firstOrder(spy: { mock: { invocationCallOrder: number[] } }): number {
  const first = spy.mock.invocationCallOrder[0];
  if (first === undefined) throw new Error("the stand-in was never called");
  return first;
}

function auditEntry(): Record<string, unknown> {
  return firstCall(h.logAudit)[1] as Record<string, unknown>;
}

function pages(): Array<[number, number]> {
  return h.findMany.mock.calls.map((call) => {
    const args = call[0] as { take: number; skip: number };
    return [args.take, args.skip];
  });
}

async function rawText(response: Response): Promise<string> {
  // Response.text() drops a leading byte-order mark; ignoreBOM keeps it so the whole file can be compared.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await response.arrayBuffer()));
}

/** The file is the byte-order mark and the header line, then one non-blank line per row, each ended by CRLF. */
function expectWholeLines(raw: string, rowCount: number): void {
  const parts = raw.split("\r\n");
  expect(parts).toHaveLength(rowCount + 2);
  expect(parts[parts.length - 1]).toBe("");
  expect(parts.slice(0, -1).every((part) => part.length > 0)).toBe(true);
}

function lines(text: string): string[] {
  return text.replace(BOM, "").split("\r\n").filter((line) => line.length > 0);
}

function lineAt(text: string, index: number): string {
  const line = lines(text)[index];
  if (line === undefined) throw new Error(`the download has no line ${index}`);
  return line;
}

function readerOf(response: Response): ReadableStreamDefaultReader<Uint8Array> {
  if (!response.body) throw new Error("the response has no body");
  return response.body.getReader();
}

function setLocale(locale: string): void {
  h.getI18n.mockResolvedValue({ t: (key: string) => key, locale });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T22:50:00.000Z`));
  h.requireAuth.mockReset().mockResolvedValue({ actor: ACTOR, shop: { shopId: "default" } });
  h.auditIdentity.mockReset().mockReturnValue(AUDIT_ACTOR);
  h.logAudit.mockReset().mockResolvedValue(undefined);
  // The real writer returns an ArrayBuffer.
  h.toXlsx.mockReset().mockReturnValue(XLSX_BYTES.buffer.slice(0));
  h.logError.mockReset();
  h.count.mockReset();
  h.findMany.mockReset();
  serve(rows(3));
  setLocale("en");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/export/deliveries: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports GET and no other HTTP verb", () => {
    expect(typeof route.GET).toBe("function");
    for (const verb of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(route, verb).not.toHaveProperty(verb);
    }
  });

  // requireAuth is a stand-in here, so it cannot notice a misspelt permission. The real catalog can: a name that is
  // not in it would fail closed for everybody, including the owner.
  it("demands permissions that really exist in the action catalog", () => {
    for (const action of PERMISSIONS) {
      expect(PHASE2_ACTIONS as readonly string[], action).toContain(action);
    }
  });

  it("demands all four permissions in one call, nothing less", async () => {
    await GET(get());
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
    const [actions] = firstCall(h.requireAuth);
    expect([...(actions as string[])].sort()).toEqual([...PERMISSIONS].sort());
  });

  // The argument the route REALLY passed is run through the real role table: a misspelt name, or a change to the
  // preset roles, changes the list. A DROPPED name is caught by the exact-set test above, not by this one (the operator
  // and the viewer lack data.export, so dropping another name still leaves owner and manager). requireAuth itself is a
  // stand-in. The operator can read deliveries but cannot export data.
  it("asks for a set of permissions that only the owner and the manager hold in full", async () => {
    await GET(get());
    const demanded = firstCall(h.requireAuth)[0] as Phase2Action[];
    const holders = (["owner", "manager", "operator", "viewer"] as const).filter((role) =>
      demanded.every((action) => hasPhase2Permission(getPhase2PresetPermissions(role), action)),
    );
    expect(holders).toEqual(["owner", "manager"]);
  });

  it("counts, audits, reads and writes nothing for a caller without the permissions", async () => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("Forbidden", "ACTION_FORBIDDEN", 403));
    const response = await GET(get("?format=xlsx"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.count).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.toXlsx).not.toHaveBeenCalled();
  });

  it("checks who is asking, then counts, then audits, in that order", async () => {
    const response = await GET(get());
    await response.text();
    const order = [h.requireAuth, h.count, h.logAudit, h.findMany].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(4);
  });
});

describe("GET /api/export/deliveries: the audit entry", () => {
  it("records one export.deliveries entry for a CSV: the format, the row count, no filters, not truncated", async () => {
    const response = await GET(get());
    await response.text();
    expect(h.auditIdentity).toHaveBeenCalledWith(ACTOR);
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    const [context] = firstCall(h.logAudit) as [{ prisma: unknown; shop: unknown }];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(auditEntry()).toStrictEqual({
      action: "export.deliveries",
      entity: "deliveries",
      actor: AUDIT_ACTOR,
      after: { entity: "deliveries", format: "csv", rowCount: 3, filterNames: [], truncated: false },
    });
  });

  it("records the format xlsx for an XLSX download", async () => {
    await (await GET(get("?format=xlsx"))).arrayBuffer();
    expect((auditEntry().after as { format: string }).format).toBe("xlsx");
  });

  it("writes the audit entry BEFORE the first row is read (a CSV is read page by page, after the reply starts)", async () => {
    const response = await GET(get());
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expect(h.findMany).not.toHaveBeenCalled();
    await response.text();
    expect(h.findMany).toHaveBeenCalled();
  });

  it("keeps every row field out of the audit entry", async () => {
    await (await GET(get())).text();
    const written = JSON.stringify(h.logAudit.mock.calls);
    for (const value of ["YAL-00001", "+213555123456", "Amine B.", "Bab El Oued", "ORD-1"]) {
      expect(written).not.toContain(value);
    }
  });

  it("takes the actor from the server, not from the query string", async () => {
    await (await GET(get("?actor=person:someone-else&rowCount=99&filterNames=x"))).text();
    expect(auditEntry()).toStrictEqual({
      action: "export.deliveries",
      entity: "deliveries",
      actor: AUDIT_ACTOR,
      after: { entity: "deliveries", format: "csv", rowCount: 3, filterNames: [], truncated: false },
    });
  });

  it("counts the rows that match with one query that leaves out soft-deleted deliveries", async () => {
    await (await GET(get())).text();
    expect(h.count).toHaveBeenCalledTimes(1);
    expect(h.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });

  // OBSERVED, not endorsed: the format is copied into the audit entry as the caller wrote it, and any value other than
  // the exact lower-case text xlsx is served as a CSV. Update the test if the route is changed on purpose.
  it.each([
    ["pdf", "pdf"],
    ["XLSX (other letter case)", "XLSX"],
    ["an empty value", ""],
  ])("OBSERVED: serves a CSV and audits the format as written for %s", async (_label, format) => {
    const response = await GET(get(`?format=${format}`));
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    await response.text();
    expect((auditEntry().after as { format: string }).format).toBe(format);
    expect(h.toXlsx).not.toHaveBeenCalled();
  });
});

describe("GET /api/export/deliveries: the CSV download", () => {
  it("answers 200 with the CSV type, no-store, the row count and a dated file name", async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="deliveries-${TODAY}.csv"`);
    expect(response.headers.get("X-Export-Row-Count")).toBe("3");
    expect(response.headers.get("X-SahelFlow-Shop-Id")).toBe("default");
    await response.text();
  });

  it("never says the file was cut: this export has no row cap", async () => {
    const response = await GET(get());
    expect(response.headers.get("X-Export-Truncated")).toBeNull();
    expect(response.headers.get("X-Export-Total-Rows")).toBeNull();
    expect(response.headers.get("X-Export-Row-Limit")).toBeNull();
    await response.text();
  });

  it("starts with a byte-order mark and the ten column labels, then one line per delivery, each ending in CRLF", async () => {
    const bytes = new Uint8Array(await (await GET(get())).arrayBuffer());
    // Response.text() drops a leading byte-order mark, so the raw bytes are checked: EF BB BF.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text.startsWith(BOM)).toBe(true);
    expect(text.endsWith("\r\n")).toBe(true);
    expectWholeLines(text, 3);
    const all = lines(text);
    expect(all).toHaveLength(4);
    expect(all[0]).toBe(LABEL_KEYS.join(","));
  });

  it("writes each delivery's ten fields in column order, the date in the locale of the page", async () => {
    const text = await (await GET(get())).text();
    const first = delivery(1);
    expect(lines(text)[1]).toBe(
      [
        "YAL-00001",
        "yalidine",
        "ORD-1",
        "Amine B.",
        "+213555123456",
        "16",
        "Bab El Oued",
        "deliveries.status.pending",
        "450",
        first.createdAt.toLocaleString(intlLocale("en")),
      ]
        .map((value) => (value.includes(",") ? `"${value}"` : value))
        .join(","),
    );
  });

  it("asks the translation function for the status key written in camelCase (picked_up becomes pickedUp)", async () => {
    serve([delivery(1, { status: "picked_up" }), delivery(2, { status: "returned_to_sender" })]);
    const text = await (await GET(get())).text();
    expect(text).toContain("deliveries.status.pickedUp");
    expect(text).toContain("deliveries.status.returnedToSender");
  });

  it("writes an empty text for a missing tracking number or customer, and 0 for a missing cost", async () => {
    serve([delivery(1, { trackingNumber: null, cost: null, order: { ...delivery(1).order, customer: null } })]);
    const text = await (await GET(get())).text();
    const fields = lineAt(text, 1).split(",");
    expect(fields[0]).toBe("");
    expect(fields[3]).toBe("");
    expect(fields[8]).toBe("0");
  });

  it("neutralises a customer name that a spreadsheet would run as a formula, and quotes fields with a comma or a quote", async () => {
    serve([
      delivery(1, {
        order: { ...delivery(1).order, customer: { name: '=HYPERLINK("http://example.test")' }, commune: "Bab El Oued, Alger" },
      }),
    ]);
    const text = await (await GET(get())).text();
    // The leading apostrophe makes it plain text; the quotes inside are doubled and the field is quoted.
    expect(text).toContain(`"'=HYPERLINK(""http://example.test"")"`);
    expect(text).toContain('"Bab El Oued, Alger"');
  });

  it("leaves a phone number that starts with a plus sign as it is", async () => {
    const text = await (await GET(get())).text();
    expect(lineAt(text, 1).split(",")[4]).toBe("+213555123456");
  });

  it("answers a header line and nothing else when there are no deliveries, with a row count of 0", async () => {
    serve([]);
    const response = await GET(get());
    expect(response.headers.get("X-Export-Row-Count")).toBe("0");
    expect(await rawText(response)).toBe(`${BOM}${LABEL_KEYS.join(",")}\r\n`);
    expect((auditEntry().after as { rowCount: number }).rowCount).toBe(0);
  });

  it("reads only the listed fields (no email, address or notes) and never soft-deleted rows, newest first with a tie-break", async () => {
    await (await GET(get())).text();
    const [args] = firstCall(h.findMany) as [Record<string, unknown>];
    expect(args.where).toStrictEqual({ deletedAt: null });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.select).toStrictEqual({
      trackingNumber: true,
      provider: true,
      status: true,
      cost: true,
      createdAt: true,
      order: {
        select: {
          orderNumber: true,
          phone: true,
          wilaya: true,
          commune: true,
          customer: { select: { name: true } },
        },
      },
    });
  });

  it("reads the deliveries 500 at a time, each page once, and stops after a short page", async () => {
    serve(rows(1001));
    expectWholeLines(await rawText(await GET(get())), 1001);
    expect(pages()).toEqual([[500, 0], [500, 500], [500, 1000]]);
  });

  it("asks for one more (empty) page when the last page is exactly full", async () => {
    serve(rows(500));
    expectWholeLines(await rawText(await GET(get())), 500);
    expect(pages()).toEqual([[500, 0], [500, 500]]);
  });

  it("has sent the header line and the first page when a later page fails, then the download breaks", async () => {
    const all = rows(600);
    h.findMany.mockReset().mockImplementation(async (args: { take: number; skip: number }) => {
      if (args.skip >= 500) throw new Error("database is locked");
      return all.slice(args.skip, args.skip + args.take);
    });
    const response = await GET(get());
    expect(response.status).toBe(200);
    const reader = readerOf(response);
    // ignoreBOM keeps the byte-order mark in the decoded text (the default decoder would drop it).
    const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
    let received = "";
    const drain = async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        received += decoder.decode(value, { stream: true });
      }
    };
    await expect(drain()).rejects.toThrow("database is locked");
    expect(received.startsWith(`${BOM}${LABEL_KEYS.join(",")}`)).toBe(true);
    expect(lines(received).length).toBeGreaterThan(1);
  });
});

describe("GET /api/export/deliveries: the XLSX download", () => {
  it("answers 200 with the spreadsheet type, the bytes the writer returned, the row count and a dated file name", async () => {
    const response = await GET(get("?format=xlsx"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="deliveries-${TODAY}.xlsx"`);
    expect(response.headers.get("X-Export-Row-Count")).toBe("3");
    expect(response.headers.get("X-Export-Truncated")).toBeNull();
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...XLSX_BYTES]);
  });

  // OBSERVED, not endorsed: the CSV answer says no-store, the XLSX answer carries no Cache-Control at all, although both
  // hold customer names and phone numbers. Update the test if the route is changed on purpose.
  it("OBSERVED: sends no Cache-Control header with the XLSX download (the CSV one says no-store)", async () => {
    const response = await GET(get("?format=xlsx"));
    expect(response.headers.get("Cache-Control")).toBeNull();
    await response.arrayBuffer();
  });

  it("writes the audit entry before the first row is read for an XLSX too, and keeps every row field out of it", async () => {
    await (await GET(get("?format=xlsx"))).arrayBuffer();
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expect(firstOrder(h.logAudit)).toBeLessThan(firstOrder(h.findMany));
    const written = JSON.stringify(h.logAudit.mock.calls);
    for (const value of ["YAL-00001", "+213555123456", "Amine B.", "Bab El Oued", "ORD-1"]) {
      expect(written).not.toContain(value);
    }
  });

  it("hands the writer one object per delivery and the ten columns, in order, with the translated labels", async () => {
    await (await GET(get("?format=xlsx"))).arrayBuffer();
    expect(h.toXlsx).toHaveBeenCalledTimes(1);
    const [written, columns] = firstCall(h.toXlsx) as [Array<Record<string, unknown>>, Array<{ key: string; label: string }>];
    expect(columns.map((column) => column.key)).toEqual(COLUMN_KEYS);
    expect(columns.map((column) => column.label)).toEqual(LABEL_KEYS);
    expect(written).toHaveLength(3);
    expect(written[0]).toEqual({
      trackingNumber: "YAL-00001",
      provider: "yalidine",
      orderNumber: "ORD-1",
      customerName: "Amine B.",
      phone: "+213555123456",
      wilaya: "16",
      commune: "Bab El Oued",
      status: "deliveries.status.pending",
      cost: 450,
      createdAt: delivery(1).createdAt.toLocaleString(intlLocale("en")),
    });
  });

  // The CSV path turns a missing value into an empty field whatever the route does, so only the writer's input can
  // tell that the route itself blanked it.
  it("hands the writer an empty text for a missing tracking number or customer, and 0 for a missing cost", async () => {
    serve([delivery(1, { trackingNumber: null, cost: null, order: { ...delivery(1).order, customer: null } })]);
    await (await GET(get("?format=xlsx"))).arrayBuffer();
    const [written] = firstCall(h.toXlsx) as [Array<Record<string, unknown>>];
    expect(written[0]).toMatchObject({ trackingNumber: "", customerName: "", cost: 0 });
  });

  it("reads the deliveries 500 at a time up to the count, the last page only as large as what is left", async () => {
    serve(rows(1200));
    await (await GET(get("?format=xlsx"))).arrayBuffer();
    expect(pages()).toEqual([[500, 0], [500, 500], [200, 1000]]);
    expect(firstCall(h.toXlsx)[0]).toHaveLength(1200);
  });

  it("writes an empty sheet, and reads nothing, when there are no deliveries", async () => {
    serve([]);
    const response = await GET(get("?format=xlsx"));
    expect(response.status).toBe(200);
    expect(h.findMany).not.toHaveBeenCalled();
    expect(firstCall(h.toXlsx)[0]).toEqual([]);
    expect(response.headers.get("X-Export-Row-Count")).toBe("0");
  });

  it("accepts exactly 10,000 deliveries", async () => {
    serve(rows(10_000));
    const response = await GET(get("?format=xlsx"));
    expect(response.status).toBe(200);
    expect(firstCall(h.toXlsx)[0]).toHaveLength(10_000);
  });

  it("refuses 10,001 deliveries with 413 XLSX_EXPORT_TOO_LARGE, reads no row and writes no file", async () => {
    h.count.mockResolvedValue(10_001);
    const response = await GET(get("?format=xlsx"));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "XLSX_EXPORT_TOO_LARGE" });
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.toXlsx).not.toHaveBeenCalled();
  });

  // OBSERVED, not endorsed: the audit entry is written before the size check, so a refused download is audited as an
  // export of 10,001 rows although nothing left the server.
  it("OBSERVED: has already audited the refused download as an export of 10,001 rows", async () => {
    h.count.mockResolvedValue(10_001);
    await GET(get("?format=xlsx"));
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expect(auditEntry().after).toMatchObject({ format: "xlsx", rowCount: 10_001, truncated: false });
  });

  it("answers a generic 500 that holds no secret, and no file, when a page fails to load", async () => {
    h.findMany.mockReset().mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await GET(get("?format=xlsx"));
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.toXlsx).not.toHaveBeenCalled();
    // The audit entry was already written when the page failed.
    expect(h.logAudit).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/export/deliveries: the language", () => {
  it.each([
    ["en", "deliveries"],
    ["fr", "livraisons"],
    ["de", "deliveries"],
  ])("names the file with the %s word and dates the rows in that locale (an unknown language gets the English word and French dates)", async (locale, prefix) => {
    setLocale(locale);
    const response = await GET(get());
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="${prefix}-${TODAY}.csv"`);
    const text = await response.text();
    const stamp = delivery(1).createdAt.toLocaleString(intlLocale(locale));
    // A date with a comma in it is written between quotes.
    const field = stamp.includes(",") ? `"${stamp}"` : stamp;
    expect(lineAt(text, 1).endsWith(field)).toBe(true);
  });

  // The date expectations above compare the route with the formatter it calls, so they cannot see which clock it writes.
  // OBSERVED, not endorsed: src/lib/utils.ts says every seller-facing time is written on a 24-hour clock (DZ_CLOCK)
  // because the fr-DZ and ar-DZ patterns are 12-hour; this route calls toLocaleString(locale) without it, so the French
  // file carries AM/PM times while the English one does not. Update the test if the route is changed on purpose.
  it("OBSERVED: writes the French time on a 12-hour clock (AM/PM) and the English one on a 24-hour clock", async () => {
    setLocale("fr");
    expect(lineAt(await (await GET(get())).text(), 1)).toMatch(/\b(AM|PM)\b/);
    setLocale("en");
    expect(lineAt(await (await GET(get())).text(), 1)).not.toMatch(/\b(AM|PM)\b/);
  });

  it("names the XLSX file with the French word too", async () => {
    setLocale("fr");
    const response = await GET(get("?format=xlsx"));
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="livraisons-${TODAY}.xlsx"`);
    await response.arrayBuffer();
  });

  // The route used to put the Arabic word for "deliveries" straight into the Content-Disposition header (issue #565). A
  // header value can only hold characters up to code point 255, so the real NextResponse threw and the seller got a
  // generic 500 after the rows had been counted and the audit entry written. The control below pins that platform fact;
  // the tests after it pin the fix: an ASCII fallback in filename and the real name in filename* (RFC 5987), a header the
  // platform accepts, and a download that arrives.
  it("control: the platform refuses an Arabic file name written straight into a header value", () => {
    expect(() => new Headers({ "Content-Disposition": 'attachment; filename="\u062a\u0648\u0635\u064a\u0644\u0627\u062a-2026-10-21.csv"' })).toThrow(TypeError);
  });

  const ARABIC_DELIVERIES = "\u062a\u0648\u0635\u064a\u0644\u0627\u062a";

  it.each([
    ["CSV", "csv", ""],
    ["XLSX", "xlsx", "?format=xlsx"],
  ])("answers 200 for an Arabic %s download, naming the file in Arabic in filename* and in English in filename", async (_label, extension, query) => {
    setLocale("ar");
    const response = await GET(get(query));
    expect(response.status).toBe(200);
    const header = response.headers.get("Content-Disposition") ?? "";
    expect(header).toBe(
      `attachment; filename="deliveries-${TODAY}.${extension}"; filename*=UTF-8''${encodeURIComponent(`${ARABIC_DELIVERIES}-${TODAY}.${extension}`)}`,
    );
    // Every character of the header is plain ASCII, and the extended name decodes back to the Arabic file name.
    expect(header).toMatch(/^[\x20-\x7E]+$/);
    const extended = /filename\*=UTF-8''([^;]+)$/.exec(header)?.[1] ?? "";
    expect(decodeURIComponent(extended)).toBe(`${ARABIC_DELIVERIES}-${TODAY}.${extension}`);
    await response.arrayBuffer();
    expect(h.count).toHaveBeenCalledTimes(1);
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expect(extension === "xlsx" ? h.toXlsx : h.findMany).toHaveBeenCalled();
  });

  it("still names the English and French files with a single plain filename, as before", async () => {
    for (const [locale, prefix] of [["en", "deliveries"], ["fr", "livraisons"]] as const) {
      setLocale(locale);
      const header = (await GET(get())).headers.get("Content-Disposition");
      expect(header).toBe(`attachment; filename="${prefix}-${TODAY}.csv"`);
      expect(header).not.toContain("filename*");
    }
  });
});

describe("GET /api/export/deliveries: when something breaks before the first row", () => {
  it("answers a generic 500 that holds no secret, and writes no audit entry, when the count fails", async () => {
    h.count.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await GET(get());
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logAudit).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });
});
