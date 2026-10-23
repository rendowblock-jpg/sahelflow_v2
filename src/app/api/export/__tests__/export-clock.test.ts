import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The order, delivery and return exports write a "date" column that carries a time of day. src/lib/utils.ts says every
// seller-facing time is on a 24-hour clock (DZ_CLOCK) because the fr-DZ and ar-DZ patterns are 12-hour ("4:05:07 PM",
// "4:05:07 م"); the three routes called toLocaleString(locale) without it, so the French and Arabic files carried AM/PM
// (issue 566). This file checks the date cell of each of the three routes, in each language, at hours chosen to catch
// the usual clock mistakes (midnight written 24:05 or 12:05, a morning hour without its leading zero, an afternoon hour
// left on 12 hours). The expected text is built from the date's own hour, minute and second, so it does not depend on the
// time zone of the machine that runs the test.
//
// Real code under test: the three routes, withErrorHandler, NextResponse, the paged export helpers, the export audit
// payload, intlLocale and formatExportDateTime. Stand-ins: identity (requireAuth, audit identity), the audit writer, the
// database (count and findMany answered from one row), the translation function (it returns the key), the XLSX writer
// (it receives the rows, which is where the date cell is read; the spreadsheet file format is NOT tested), the orders
// filter builder (a fixed answer), and the logger/monitoring hooks withErrorHandler calls.
const h = vi.hoisted(() => ({
  state: { locale: "fr" as string },
  requireAuth: vi.fn(),
  auditIdentity: vi.fn(),
  logAudit: vi.fn(),
  getI18n: vi.fn(),
  toXlsx: vi.fn(),
  orderCount: vi.fn(),
  orderFindMany: vi.fn(),
  deliveryCount: vi.fn(),
  deliveryFindMany: vi.fn(),
  returnCount: vi.fn(),
  returnFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: h.auditIdentity }));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/i18n-server", () => ({ getI18n: h.getI18n }));
vi.mock("@/lib/import/export", () => ({ toXlsx: h.toXlsx }));
vi.mock("@/lib/orders/order-list-workbench", () => ({
  resolveOrdersWorkbenchAccess: () => ({ financials: true }),
  buildOrdersWorkbenchWhere: async () => ({ deletedAt: null }),
  ordersWorkbenchOrderBy: () => [{ createdAt: "desc" }, { id: "desc" }],
}));
vi.mock("@/lib/db", () => ({
  db: {
    order: { count: h.orderCount, findMany: h.orderFindMany },
    delivery: { count: h.deliveryCount, findMany: h.deliveryFindMany },
    return: { count: h.returnCount, findMany: h.returnFindMany },
  },
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import { GET as deliveries } from "@/app/api/export/deliveries/route";
import { GET as orders } from "@/app/api/export/orders/route";
import { GET as returns } from "@/app/api/export/returns/route";
import { formatExportDateTime } from "@/lib/utils";

const ACTOR = { kind: "person" as const, personId: "5".repeat(32), role: "owner" as const };
const pad = (value: number) => String(value).padStart(2, "0");
/** 21 October 2026, hour:05:07, in the time zone of the machine (the same zone toLocaleString reads). */
const at = (hour: number) => new Date(2026, 9, 21, hour, 5, 7);
const AM_PM = /\b(AM|PM)\b|[\u0635\u0645]/u;
const CLOCK = /(?<![\d:])(\d{1,2}):(\d{2}):(\d{2})(?![\d:])/;

/** Answers all three tables with one row whose date is `createdAt`. */
function serve(createdAt: Date): void {
  const order = {
    orderNumber: "ORD-1",
    status: "pending",
    phone: "+213555123456",
    wilaya: "16",
    commune: "Bab El Oued",
    totalPrice: 4500,
    deliveryCost: 450,
    source: "manual",
    createdAt,
    customer: { name: "Amine B." },
    delivery: null,
  };
  const delivery = {
    trackingNumber: "YAL-00001",
    provider: "yalidine",
    status: "pending",
    cost: 450,
    createdAt,
    order: { orderNumber: "ORD-1", customer: { name: "Amine B." }, phone: "+213555123456", wilaya: "16", commune: "Bab El Oued" },
  };
  const entry = { type: "refund", status: "pending", reason: "damaged", createdAt, order: { orderNumber: "ORD-1", customer: { name: "Amine B." } } };
  // A page past the first one is empty, so the paged reader stops.
  const page = (rows: unknown[]) => async (args: { skip?: number }) => ((args.skip ?? 0) === 0 ? rows : []);
  h.orderCount.mockResolvedValue(1);
  h.orderFindMany.mockImplementation(page([order]));
  h.deliveryCount.mockResolvedValue(1);
  h.deliveryFindMany.mockImplementation(page([delivery]));
  h.returnCount.mockResolvedValue(1);
  h.returnFindMany.mockImplementation(page([entry]));
}

/** The text of the date cell the route handed to the spreadsheet writer. */
async function dateCell(route: (request: NextRequest) => Promise<Response>, path: string, locale: string, createdAt: Date): Promise<string> {
  h.state.locale = locale;
  serve(createdAt);
  h.toXlsx.mockClear();
  const response = await route(new NextRequest(`http://localhost/api/export/${path}?format=xlsx`));
  expect(response.status, `${path} ${locale}`).toBe(200);
  await response.arrayBuffer();
  expect(h.toXlsx).toHaveBeenCalledTimes(1);
  const rows = h.toXlsx.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
  expect(rows).toHaveLength(1);
  const cell = rows[0]?.createdAt;
  if (typeof cell !== "string") throw new Error(`${path} ${locale}: the date cell is not text`);
  return cell;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.locale = "fr";
  h.requireAuth.mockResolvedValue({ actor: ACTOR });
  h.auditIdentity.mockReturnValue(`person:${ACTOR.personId}`);
  h.logAudit.mockResolvedValue(undefined);
  h.getI18n.mockImplementation(async () => ({ t: (key: string) => key, locale: h.state.locale }));
  h.toXlsx.mockReturnValue(new Uint8Array([1, 2, 3]));
});

describe("formatExportDateTime: the date, then the time on a 24-hour clock", () => {
  const HOURS = [0, 1, 9, 11, 12, 13, 15, 23] as const;

  it.each(["fr", "ar", "en", "de"])("%s: every hour is written as two digits, with no AM/PM and no Arabic day-period letter", (locale) => {
    for (const hour of HOURS) {
      const text = formatExportDateTime(at(hour), locale);
      expect(text, `${locale} ${hour}h`).not.toMatch(AM_PM);
      const clock = CLOCK.exec(text);
      expect(clock?.[0], `${locale} ${hour}h: "${text}"`).toBe(`${pad(hour)}:05:07`);
    }
  });

  it("keeps the shape the files had: day/month/year first, a comma only where the language already had one", () => {
    expect(formatExportDateTime(at(15), "fr")).toBe("21/10/2026 15:05:07");
    expect(formatExportDateTime(at(15), "en")).toBe("21/10/2026, 15:05:07");
    // an unknown language gets the French dates, as intlLocale does everywhere else
    expect(formatExportDateTime(at(15), "de")).toBe("21/10/2026 15:05:07");
    // Arabic keeps its own punctuation and direction marks; only the clock is checked here
    expect(formatExportDateTime(at(15), "ar")).toMatch(/2026\u060c? 15:05:07$/u);
  });
});

describe.each([
  ["orders", orders],
  ["deliveries", deliveries],
  ["returns", returns],
] as const)("GET /api/export/%s: the date column", (path, route) => {
  it.each(["fr", "ar", "en"])("%s: writes the time on a 24-hour clock at every tested hour", async (locale) => {
    for (const hour of [0, 9, 15, 23]) {
      const cell = await dateCell(route, path, locale, at(hour));
      expect(cell, `${path} ${locale} ${hour}h: "${cell}"`).not.toMatch(AM_PM);
      expect(CLOCK.exec(cell)?.[0], `${path} ${locale} ${hour}h: "${cell}"`).toBe(`${pad(hour)}:05:07`);
    }
  });

  it("writes the same text as formatExportDateTime, so the three exports and any later one agree", async () => {
    for (const locale of ["fr", "ar", "en", "de"]) {
      const cell = await dateCell(route, path, locale, at(15));
      expect(cell, `${path} ${locale}`).toBe(formatExportDateTime(at(15), locale));
    }
  });
});
