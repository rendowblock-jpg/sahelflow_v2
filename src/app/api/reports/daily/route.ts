import { env } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBool, getSetting, SETTING_KEYS } from "@/lib/settings";
import { generateDailyReport } from "@/lib/reports/daily-report";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/reports/daily
 *
 * Generates the daily report for yesterday and sends it via WhatsApp to the
 * configured phone number. Intended to be called by an external cron (curl,
 * system crontab, or a service like cron-job.org).
 *
 * Auth: requires `x-cron-secret` header matching the `CRON_SECRET` env var
 * (or the `cron_secret` secret in the Secret store). This prevents random
 * visitors from triggering the report.
 *
 * Behavior:
 *   - If daily_report_enabled ≠ "true" → 200 { ok: false, reason: "disabled" }
 *   - If daily_report_phone is not set → 200 { ok: false, reason: "no phone" }
 *   - If no orders yesterday → 200 { ok: false, reason: "no orders" }
 *   - If WhatsApp sidecar is down → 200 { ok: false, reason: "sidecar unavailable" }
 *     (still creates a Notification so the seller sees the report in-app)
 *   - On success → 200 { ok: true, report: {...} }
 *
 * Also accepts GET (same behavior, same auth) for cron services that can't
 * send custom headers — but GET is less secure, prefer POST.
 *
 * Localization: when triggered from the in-app UI (manual), the user's locale
 * cookie is read via getI18n(). When triggered by an external cron (no
 * cookie), the report falls back to the default locale (fr — the business
 * default in Algeria).
 */
async function handleReport(trigger: "cron" | "manual"): Promise<NextResponse> {
  // 1. Check if the daily report is enabled
  const enabled = await getBool(SETTING_KEYS.dailyReportEnabled, false);
  if (!enabled && trigger === "cron") {
    return NextResponse.json({ ok: false, reason: "disabled" });
  }

  // 2. Get the recipient phone
  const phone = await getSetting(SETTING_KEYS.dailyReportPhone);
  if (!phone) {
    return NextResponse.json({ ok: false, reason: "no phone configured" });
  }

  // 3. Read locale (manual trigger has cookie; cron falls back to default fr)
  const { t, locale } = await getI18n();

  // 4. Generate the report
  const report = await generateDailyReport(locale);
  if (!report) {
    return NextResponse.json({ ok: false, reason: "no orders yesterday" });
  }

  // 5. Create an in-app Notification (always — so the report is visible even
  //    if the WhatsApp send fails)
  const localeTag = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
  await db.notification.create({
    data: {
      type: "daily_report",
      title: t("dailyReport.notificationTitle", { date: report.date.toLocaleDateString(localeTag) }),
      body: t("dailyReport.notificationBody", { count: report.ordersCount, revenue: report.revenue.toLocaleString(localeTag) }),
      read: false,
    },
  });

  // 6. Send via WhatsApp
  let whatsappSent = false;
  let whatsappError: string | undefined;
  try {
    const result = await sidecar.send(phone, report.message);
    whatsappSent = result.ok !== false;
  } catch (err) {
    whatsappError = err instanceof Error ? err.message : "Send failed";
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

/** Verify the cron secret from header or env.
 *
 * Production: header must match env.cronSecret (CRON_SECRET).
 * Dev: when CRON_SECRET is unset (the common dev case), fall back to the
 * default public secret "dev" (env.publicCronSecret) so the in-app "Test
 * Now" button works without forcing the developer to set CRON_SECRET.
 * This is safe because dev mode is local-only; the public secret is not
 * secret in dev by design. (CONN-4-BUILD finding)
 */
function verifyCronSecret(req: NextRequest): boolean {
  const headerSecret = req.headers.get("x-cron-secret");
  if (!headerSecret) return false;
  const envSecret = env.cronSecret;
  if (envSecret) {
    // Constant-time comparison (shared util)
    return constantTimeEqual(headerSecret, envSecret);
  }
  // No real secret configured — allow the default "dev" secret in non-prod.
  if (process.env.NODE_ENV !== "production") {
    return constantTimeEqual(headerSecret, env.publicCronSecret ?? "dev");
  }
  return false;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleReport("cron");
}, "POST /api/reports/daily");

/** GET variant for cron services that only support GET (less secure). */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleReport("cron");
}, "GET /api/reports/daily");
