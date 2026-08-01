import { env } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";
import { getBool, getSetting, SETTING_KEYS } from "@/lib/settings";
import { db, shopContext } from "@/lib/db";
import { generateDailyReport } from "@/lib/reports/daily-report";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { getI18n } from "@/lib/i18n-server";
import {
  isAlgerianDemoLoaded,
  withDemoPolicyLock,
} from "@/lib/demo/algerian-demo-policy";

/** Setting key for the daily-report idempotency guard (W2-9).
 *  Stores the last Algiers-local date (YYYY-MM-DD) on which the report
 *  was successfully sent. The cron route skips re-sending when this
 *  matches today's Algiers date. */
const DAILY_REPORT_LAST_SENT_KEY = "daily_report_last_sent_at";

/** Format a Date as the Algiers-local calendar date "YYYY-MM-DD". */
function getAlgiersTodayDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export const dynamic = "force-dynamic";

/**
 * Generate and send one report while the shared demo/effect policy lock is
 * held. Demo load/remove and report-setting writes use the same lock, so the
 * marker cannot appear between this guard and report generation/sidecar send.
 */
async function executeReport(
  trigger: "cron" | "manual",
): Promise<NextResponse> {
  const context = { prisma: db, shop: shopContext };

  // Defense in depth: the Settings route prevents configuring an effectful
  // report while the demo is loaded, but cron/manual sends also fail closed in
  // case settings were changed by an older binary, direct maintenance path or
  // interrupted update. Do this before reading orders or calling the sidecar.
  if (await isAlgerianDemoLoaded(db)) {
    return NextResponse.json(
      {
        ok: false,
        reason: "demo workspace loaded",
        code: "DEMO_REPORT_SEND_BLOCKED",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 1. Check if the daily report is enabled
  const enabled = await getBool(context, SETTING_KEYS.dailyReportEnabled, false);
  if (!enabled && trigger === "cron") {
    return NextResponse.json({ ok: false, reason: "disabled" });
  }

  // 2. Get the recipient phone
  const phone = await getSetting(context, SETTING_KEYS.dailyReportPhone);
  if (!phone) {
    return NextResponse.json({ ok: false, reason: "no phone configured" });
  }

  // W2-9 (idempotency): if the report was already sent today (Algiers
  // local date), skip.
  const todayAlgiers = getAlgiersTodayDate();
  const lastSent = await getSetting(context, DAILY_REPORT_LAST_SENT_KEY);
  if (lastSent === todayAlgiers) {
    return NextResponse.json({ ok: true, skipped: "already sent today" });
  }

  // 3. Read locale (manual trigger has cookie; cron falls back to default fr)
  const { locale } = await getI18n();

  // 4. Generate the report
  const report = await generateDailyReport(locale);
  if (!report) {
    return NextResponse.json({ ok: false, reason: "no orders yesterday" });
  }

  // 5. Send via WhatsApp while demo load remains serialized behind this
  // operation. Holding the lock through the external effect prevents the sample
  // transaction from committing after the marker check but before the send.
  let whatsappSent = false;
  let whatsappError: string | undefined;
  try {
    const result = await sidecar.send(phone, report.message);
    whatsappSent = result.ok !== false;
  } catch (err) {
    whatsappError = err instanceof Error ? err.message : "Send failed";
  }

  // W2-9 (idempotency): only mark as sent when the WhatsApp send succeeded.
  if (whatsappSent) {
    try {
      await context.prisma.setting.upsert({
        where: { key: DAILY_REPORT_LAST_SENT_KEY },
        create: { key: DAILY_REPORT_LAST_SENT_KEY, value: todayAlgiers },
        update: { value: todayAlgiers },
      });
    } catch {
      // Non-fatal — the report was sent; persistence failure may cause a retry.
    }
  }

  return NextResponse.json({
    ok: true,
    report: {
      date: report.date.toISOString(),
      ordersCount: report.ordersCount,
      revenue: report.revenue,
      deliveredCount: report.deliveredCount,
      inTransitCount: report.inTransitCount,
      returnedCount: report.returnedCount,
      newCustomers: report.newCustomers,
      topProducts: report.topProducts,
      lowStockProducts: report.lowStockProducts,
    },
    whatsappSent,
    whatsappError,
  });
}

async function handleReport(
  trigger: "cron" | "manual",
): Promise<NextResponse> {
  return withDemoPolicyLock(() => executeReport(trigger));
}

/** Verify the cron secret from header or env. */
function verifyCronSecret(req: NextRequest): boolean {
  const headerSecret = req.headers.get("x-cron-secret");
  if (!headerSecret) return false;
  const envSecret = env.cronSecret;
  if (envSecret) {
    return constantTimeEqual(headerSecret, envSecret);
  }
  if (process.env.NODE_ENV !== "production") {
    return (
      !!env.publicCronSecret &&
      constantTimeEqual(headerSecret, env.publicCronSecret)
    );
  }
  return false;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleReport("cron");
}, "POST /api/reports/daily");

/** GET is deliberately non-mutating; report delivery is POST-only. */
export const GET = withErrorHandler(async () =>
  NextResponse.json(
    { error: "Daily report delivery requires POST" },
    { status: 405, headers: { Allow: "POST" } },
  ),
"GET /api/reports/daily");
