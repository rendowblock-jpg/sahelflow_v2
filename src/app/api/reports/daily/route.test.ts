import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  queue: vi.fn(),
  requireAuth: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: { cronSecret: "cron-secret-for-this-test", publicCronSecret: "" },
}));

vi.mock("@/lib/settings", () => ({
  SETTING_KEYS: {
    dailyReportEnabled: "daily_report_enabled",
    dailyReportPhone: "daily_report_phone",
  },
  getBool: vi.fn(
    async (_ctx: unknown, key: string) => harness.settings.get(key) === "true",
  ),
  getSetting: vi.fn(
    async (_ctx: unknown, key: string) => harness.settings.get(key) ?? null,
  ),
}));

vi.mock("@/lib/db", () => ({
  shopContext: { shopId: "default" },
  db: {
    setting: {
      upsert: vi.fn(
        async (args: { where: { key: string }; create: { value: string } }) => {
          harness.settings.set(args.where.key, args.create.value);
        },
      ),
    },
  },
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: <T,>(handler: T) => handler,
}));
vi.mock("@/lib/auth/server", () => ({ requireAuth: harness.requireAuth }));
vi.mock("@/lib/i18n-server", () => ({
  getI18n: vi.fn(async () => ({ locale: "fr" })),
}));
vi.mock("@/lib/demo/algerian-demo-policy", () => ({
  withDemoPolicyLock: <T,>(operation: () => Promise<T>) => operation(),
}));
vi.mock("@/lib/reports/daily-report", () => ({
  generateDailyReport: harness.generate,
}));
vi.mock("@/lib/reports/durable-daily-whatsapp", () => ({
  queueDailyWhatsAppReport: harness.queue,
}));

import { NextRequest } from "next/server";

import { POST } from "@/app/api/reports/daily/route";

const MARKER_KEY = "daily_report_last_sent_at";

function manualRequest(): NextRequest {
  return new NextRequest("http://localhost/api/reports/daily?trigger=manual", {
    method: "POST",
  });
}

function cronRequest(): NextRequest {
  return new NextRequest("http://localhost/api/reports/daily", {
    method: "POST",
    headers: { "x-cron-secret": "cron-secret-for-this-test" },
  });
}

beforeEach(() => {
  harness.settings.clear();
  harness.settings.set("daily_report_enabled", "true");
  harness.settings.set("daily_report_phone", "0555000111");
  harness.requireAuth.mockReset().mockResolvedValue(undefined);
  harness.generate.mockReset().mockResolvedValue({
    date: new Date("2026-10-23T00:00:00Z"),
    message: "Rapport quotidien",
    ordersCount: 3,
    revenue: 12000,
    deliveredCount: 2,
    inTransitCount: 1,
    returnedCount: 0,
    newCustomers: 1,
    topProducts: [],
    lowStockProducts: [],
  });
  harness.queue.mockReset().mockResolvedValue({
    messageId: "message-1",
    effectKey: "effect-1",
    replayed: false,
    effect: {
      state: "succeeded",
      attemptCount: 1,
      nextAttemptAt: null,
      errorCode: null,
      requiresDuplicateConfirmation: false,
    },
  });
});

describe("daily report: a manual Test send is independent of the scheduled send (MNY-17)", () => {
  it("does not write the day marker the scheduled send checks", async () => {
    const res = await POST(manualRequest());
    expect(res.status).toBe(200);
    expect(harness.queue).toHaveBeenCalledTimes(1);
    expect(harness.settings.has(MARKER_KEY)).toBe(false);
  });

  it("still sends the scheduled report after a Test send the same day", async () => {
    await POST(manualRequest());
    const res = await POST(cronRequest());
    const body = await res.json();

    expect(body.skipped).toBeUndefined();
    expect(body.whatsappSent).toBe(true);
    expect(harness.queue).toHaveBeenCalledTimes(2);
    // The Test send and the scheduled send must be separate durable sends.
    expect(harness.queue.mock.calls[0]?.[1]).toMatchObject({ trigger: "manual" });
    expect(harness.queue.mock.calls[1]?.[1]?.trigger ?? "cron").toBe("cron");
  });

  it("still writes the marker for the scheduled send and skips a second scheduled run", async () => {
    await POST(cronRequest());
    expect(harness.settings.has(MARKER_KEY)).toBe(true);

    const second = await (await POST(cronRequest())).json();
    expect(second.skipped).toBe("already sent today");
    expect(harness.queue).toHaveBeenCalledTimes(1);
  });

  it("lets the seller press Test after the scheduled send, and skips a repeated Test", async () => {
    await POST(cronRequest());
    const test = await (await POST(manualRequest())).json();
    expect(test.skipped).toBeUndefined();
    expect(harness.queue).toHaveBeenCalledTimes(2);

    const again = await (await POST(manualRequest())).json();
    expect(again.skipped).toBe("already sent today");
    expect(harness.queue).toHaveBeenCalledTimes(2);
  });
});
