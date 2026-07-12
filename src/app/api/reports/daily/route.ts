import { env } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";
import { getBool, getSetting, SETTING_KEYS } from "@/lib/settings";
import { db } from "@/lib/db";
import { generateDailyReport } from "@/lib/reports/daily-report";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { getI18n } from "@/lib/i18n-server";

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
 *     (Phase 5: the in-app Notification row was removed; the WhatsApp send
 *     is the persistent record of the report)
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

  // W2-9 (idempotency): if the report was already sent today (Algiers
  // local date), skip. This prevents duplicate reports when the cron
  // fires multiple times in a day (e.g. cron-job.org retry, manual
  // trigger + scheduled cron, clock drift). The check uses the Algiers
  // calendar date so a UTC-server cron firing at 23:30 UTC = 00:30
  // Algiers next day correctly rolls over to the new day.
  const todayAlgiers = getAlgiersTodayDate();
  const lastSent = await getSetting(DAILY_REPORT_LAST_SENT_KEY);
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

  // 5. (Phase 5) In-app Notification row removed — the bell at
  //    /api/notifications computes fresh from orders/deliveries/products/
  //    returns, so a persisted daily_report row was never surfaced anyway.
  //    The WhatsApp send below is the persistent record of the report.

  // 6. Send via WhatsApp
  let whatsappSent = false;
  let whatsappError: string | undefined;
  try {
    const result = await sidecar.send(phone, report.message);
    whatsappSent = result.ok !== false;
  } catch (err) {
    whatsappError = err instanceof Error ? err.message : "Send failed";
  }

  // W2-9 (idempotency): only mark as sent when the WhatsApp send
  // actually succeeded. If it failed, leave last_sent_at unset so the
  // next cron tick can retry. (If the sidecar is down for an entire
  // day, the seller misses that day's report — preferable to silently
  // marking it as sent and never retrying.)
  if (whatsappSent) {
    try {
      await db.setting.upsert({
        where: { key: DAILY_REPORT_LAST_SENT_KEY },
        create: { key: DAILY_REPORT_LAST_SENT_KEY, value: todayAlgiers },
        update: { value: todayAlgiers },
      });
    } catch {
      // Non-fatal — the report was sent; we just couldn't persist the
      // idempotency marker. The next cron tick may re-send (duplicate
      // report), which is a minor UX issue, not a data-loss issue.
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
    // SV-L6: no `?? "dev"` fallback — if NEXT_PUBLIC_CRON_SECRET is unset
    // (empty string), constantTimeEqual returns false and the request is
    // rejected. Previously the fallback let anyone hit the cron endpoint
    // with the publicly-known "dev" secret.
    return !!env.publicCronSecret && constantTimeEqual(headerSecret, env.publicCronSecret);
  }
  return false;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleReport("cron");
}, "POST /api/reports/daily");

/** GET variant for cron services that only support GET (less secure).
 *  A-H3: cron services don't have session cookies, so this route is
 *  cron-secret-only (like POST). The previous `requireAuth()` made it
 *  unusable by cron — 401 on every scheduled call. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleReport("cron");
}, "GET /api/reports/daily");
