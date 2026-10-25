import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The shop day is the Algeria day (Africa/Algiers), whatever zone the computer is set to. Four server spots still read
// the host's clock: the dashboard greeting, the date column of the expenses export, the day labels on the analytics
// and risk charts, and the end of the analytics series window. Each case below puts the host in a zone whose day or
// hour differs from Algeria's and fixes the clock at an instant where they differ.
//
// Real code under test: the expenses export route (withErrorHandler, the paged CSV stream, intlLocale), the analytics
// report loader, analyticsService, the range resolver and the helpers in shop-day-format. Stand-ins: identity, the audit
// writer, the database (fixed rows), the profitability reader, the translation function (it returns the key) and the
// logger/monitoring hooks withErrorHandler calls. Behaviour on an Algiers host must stay exactly what it was, so every
// expectation is the old host-clock expression read on an Algiers host.

const h = vi.hoisted(() => ({
  state: { locale: "fr" as string },
  requireAuth: vi.fn(),
  auditIdentity: vi.fn(),
  logAudit: vi.fn(),
  getI18n: vi.fn(),
  toXlsx: vi.fn(),
  expenseCount: vi.fn(),
  expenseFindMany: vi.fn(),
  orderFindMany: vi.fn(),
  customerFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: h.auditIdentity }));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/i18n-server", () => ({ getI18n: h.getI18n }));
vi.mock("@/lib/import/export", () => ({ toXlsx: h.toXlsx }));
vi.mock("@/lib/db", () => ({
  db: {
    expense: { count: h.expenseCount, findMany: h.expenseFindMany },
    order: { findMany: h.orderFindMany },
    customer: { findMany: h.customerFindMany },
  },
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/accounting/profitability", () => ({
  getProfitabilitySeries: vi.fn(async () => [
    { key: "current", projection: {} },
    { key: "previous", projection: {} },
  ]),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import { GET as expensesExport } from "@/app/api/export/expenses/route";
import { resolveAnalyticsRange } from "@/lib/analytics/range";
import { getAnalyticsReportForRange } from "@/lib/analytics/report";
import { analyticsService } from "@/lib/data/analytics";
import { expenseCsvDate, greetingPeriod, shortDayLabel } from "@/lib/time/shop-day-format";
import { intlLocale } from "@/lib/utils";

const ALGIERS_HOST = "Africa/Algiers";
const LOCALES = ["fr", "ar", "en"] as const;
const ACTOR = { kind: "person" as const, personId: "5".repeat(32), role: "owner" as const };

interface HostCase {
  zone: string;
  /** An instant where the host hour and the shop hour differ. */
  at: string;
  /** Hour of the day in Algeria at `at`. */
  shopHour: number;
  period: "morning" | "afternoon" | "evening";
}

const CASES: HostCase[] = [
  {
    // 00:30 on 1 Nov in Algeria, still 31 Oct 16:30 in Los Angeles.
    zone: "America/Los_Angeles",
    at: "2026-10-31T23:30:00.000Z",
    shopHour: 0,
    period: "morning",
  },
  {
    // 12:00 on 31 Oct in Algeria, already 1 Nov 01:00 on Kiritimati (UTC+14).
    zone: "Pacific/Kiritimati",
    at: "2026-10-31T11:00:00.000Z",
    shopHour: 12,
    period: "afternoon",
  },
];

/** Runs `read` with the host set to `zone`, then puts the host back. */
function onHost<T>(zone: string, read: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return read();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

/** The expense form stores the chosen day as UTC midnight; an import may store shop midnight (23:00 UTC the day before). */
const EXPENSE_DATES = [
  "2026-11-01T00:00:00.000Z",
  "2026-10-31T23:00:00.000Z",
  "2026-10-31T00:00:00.000Z",
  "2026-12-31T23:00:00.000Z",
  "2026-03-15T00:00:00.000Z",
].map((iso) => new Date(iso));
const CHART_DAYS = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-12-31", "2027-01-01", "2026-03-29"];

let previousZone: string | undefined;

beforeEach(() => {
  previousZone = process.env.TZ;
  vi.clearAllMocks();
  h.state.locale = "fr";
  h.requireAuth.mockResolvedValue({ actor: ACTOR });
  h.auditIdentity.mockReturnValue(`person:${ACTOR.personId}`);
  h.logAudit.mockResolvedValue(undefined);
  h.getI18n.mockImplementation(async () => ({ t: (key: string) => key, locale: h.state.locale }));
  h.toXlsx.mockReturnValue(new Uint8Array([1, 2, 3]));
  h.orderFindMany.mockResolvedValue([]);
  h.customerFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  if (previousZone === undefined) delete process.env.TZ;
  else process.env.TZ = previousZone;
});

/** Serves one expense row; a page past the first one is empty so the paged reader stops. */
function serveExpense(date: Date): void {
  const row = { date, category: "rent", notes: "Loyer", amount: 1200 };
  h.expenseCount.mockResolvedValue(1);
  h.expenseFindMany.mockImplementation(async (args: { skip?: number }) => ((args.skip ?? 0) === 0 ? [row] : []));
}

describe.each(CASES)("server spots on the shop day, host in $zone", ({ zone, at, shopHour, period }) => {
  beforeEach(() => {
    process.env.TZ = zone;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at));
  });

  it("runs under a host whose hour differs from the shop hour", () => {
    expect(new Date(at).getHours()).not.toBe(shopHour);
  });

  it("dashboard greeting follows the shop hour", () => {
    expect(greetingPeriod(new Date())).toBe(period);
  });

  it.each(LOCALES)("expense CSV date (%s) reads the same as on an Algiers host", (locale) => {
    const tag = intlLocale(locale);
    for (const date of EXPENSE_DATES) {
      const onAlgiers = onHost(ALGIERS_HOST, () => date.toLocaleDateString(tag));
      expect(expenseCsvDate(date, tag), `${date.toISOString()} ${tag}`).toBe(onAlgiers);
    }
  });

  it.each(LOCALES)("chart day label (%s) reads the same as on an Algiers host", (locale) => {
    const tag = intlLocale(locale);
    for (const day of CHART_DAYS) {
      const onAlgiers = onHost(ALGIERS_HOST, () =>
        new Date(`${day}T00:00:00Z`).toLocaleDateString(tag, { month: "short", day: "numeric" }),
      );
      expect(shortDayLabel(day, tag), `${day} ${tag}`).toBe(onAlgiers);
    }
  });

  it("the expenses export writes the stored day, not the host's day", async () => {
    for (const locale of LOCALES) {
      const tag = intlLocale(locale);
      for (const date of EXPENSE_DATES) {
        h.state.locale = locale;
        serveExpense(date);
        const response = await expensesExport(new NextRequest("http://localhost/api/export/expenses?format=csv"));
        expect(response.status, `${locale} ${date.toISOString()}`).toBe(200);
        const text = await response.text();
        const onAlgiers = onHost(ALGIERS_HOST, () => date.toLocaleDateString(tag));
        expect(text, `${locale} ${date.toISOString()}`).toContain(onAlgiers);
      }
    }
  });
});

describe("literal labels, host west of Algeria", () => {
  beforeEach(() => {
    process.env.TZ = "America/Los_Angeles";
  });

  it("the CSV shows 1 November for a day stored as 1 November", () => {
    expect(expenseCsvDate(new Date("2026-11-01T00:00:00.000Z"), "en-US")).toBe("11/1/2026");
    expect(expenseCsvDate(new Date("2026-10-31T23:00:00.000Z"), "en-US")).toBe("11/1/2026");
  });

  it("the chart axis shows Nov 1 for the shop day 2026-11-01", () => {
    expect(shortDayLabel("2026-11-01", "en-US")).toBe("Nov 1");
  });
});

describe("the end of the analytics series window", () => {
  // Los Angeles leaves daylight saving on 1 Nov 2026, so a window of nine 24-hour days from 31 Oct shop midnight
  // is 23 hours long on a host that moves wall-clock days.
  it("is exactly (days - 1) days of 24 hours after the start, whatever the host zone", async () => {
    process.env.TZ = "America/Los_Angeles";
    const range = resolveAnalyticsRange(
      { range: "custom", from: "2026-10-31", to: "2026-11-09" },
      new Date("2026-11-10T12:00:00.000Z"),
    );
    expect(range.days).toBe(10);
    const series = vi.spyOn(analyticsService, "buildTimeSeries");
    vi.spyOn(analyticsService, "buildSummary").mockReturnValue({} as never);
    await getAnalyticsReportForRange(range);
    const end = series.mock.calls[0]?.[2];
    expect(end?.toISOString()).toBe(new Date(range.from.getTime() + 9 * 24 * 60 * 60 * 1000).toISOString());
    series.mockRestore();
  });
});

describe("the pages call the shop-day helpers", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("dashboard greeting does not read the host hour", () => {
    const source = read("src/app/(dashboard)/dashboard/page.tsx");
    expect(source).toContain("greetingPeriod(");
    expect(source).not.toContain(".getHours(");
  });

  it("expenses export does not format the date on the host clock", () => {
    const source = read("src/app/api/export/expenses/route.ts");
    expect(source).toContain("expenseCsvDate(");
    expect(source).not.toContain(".toLocaleDateString(");
  });

  it.each(["src/app/(dashboard)/analytics/page.tsx", "src/app/(dashboard)/risk/page.tsx"])(
    "%s labels days with shortDayLabel",
    (path) => {
      const source = read(path);
      expect(source).toContain("shortDayLabel(");
      expect(source).not.toContain(".toLocaleDateString(");
    },
  );
});
