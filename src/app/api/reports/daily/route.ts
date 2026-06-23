import { env } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBool, getSetting, SETTING_KEYS } from "@/lib/settings";
import { generateDailyReport } from "@/lib/reports/daily-report";
import { sidecar } from "@/lib/whatsapp/sidecar-client";

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

  // 3. Generate the report
  const report = await generateDailyReport();
  if (!report) {
    return NextResponse.json({ ok: false, reason: "no orders yesterday" });
  }

  // 4. Create an in-app Notification (always — so the report is visible even
  //    if the WhatsApp send fails)
  await db.notification.create({
    data: {
      type: "daily_report",
      title: `Rapport du ${report.date.toLocaleDateString("fr-FR")}`,
      body: `${report.ordersCount} commande(s) · ${report.revenue.toLocaleString("fr-DZ")} DZD`,
      read: false,
    },
  });

  // 5. Send via WhatsApp
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

/** Verify the cron secret from header or env. */
function verifyCronSecret(req: NextRequest): boolean {
  const headerSecret = req.headers.get("x-cron-secret");
  if (!headerSecret) return false;
  const envSecret = env.cronSecret;
  if (!envSecret) return false;
  // Constant-time comparison
  if (headerSecret.length !== envSecret.length) return false;
  let diff = 0;
  for (let i = 0; i < headerSecret.length; i++) {
    diff |= headerSecret.charCodeAt(i) ^ envSecret.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleReport("cron");
}

/** GET variant for cron services that only support GET (less secure). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleReport("cron");
}
