import { env } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";
import { getBool, getSetting, SETTING_KEYS } from "@/lib/settings";
import { db, shopContext } from "@/lib/db";
import { generateDailyReport } from "@/lib/reports/daily-report";
import { queueDailyWhatsAppReport } from "@/lib/reports/durable-daily-whatsapp";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { requireAuth } from "@/lib/auth/server";
import { getI18n } from "@/lib/i18n-server";
import {
  isAlgerianDemoLoaded,
  withDemoPolicyLock,
} from "@/lib/demo/algerian-demo-policy";

/**
 * Projection of the last confirmed daily-report receipt. The durable WhatsApp
 * effect is the send authority; this marker is allowed to fail and replay.
 */
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

function reportProjection(
  report: NonNullable<Awaited<ReturnType<typeof generateDailyReport>>>,
) {
  return {
    date: report.date.toISOString(),
    ordersCount: report.ordersCount,
    revenue: report.revenue,
    deliveredCount: report.deliveredCount,
    inTransitCount: report.inTransitCount,
    returnedCount: report.returnedCount,
    newCustomers: report.newCustomers,
    topProducts: report.topProducts,
    lowStockProducts: report.lowStockProducts,
  };
}

/**
 * Generate and queue one exact shop/day report while the shared demo/effect
 * policy lock is held. A stable durable WhatsApp effect prevents duplicates
 * across response loss, worker restart or marker-persistence failure.
 */
async function executeReport(
  trigger: "cron" | "manual",
): Promise<NextResponse> {
  const context = { prisma: db, shop: shopContext };

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

  const enabled = await getBool(
    context,
    SETTING_KEYS.dailyReportEnabled,
    false,
  );
  if (!enabled && trigger === "cron") {
    return NextResponse.json({ ok: false, reason: "disabled" });
  }

  const phone = await getSetting(context, SETTING_KEYS.dailyReportPhone);
  if (!phone) {
    return NextResponse.json({ ok: false, reason: "no phone configured" });
  }

  const reportDate = getAlgiersTodayDate();
  const lastSent = await getSetting(context, DAILY_REPORT_LAST_SENT_KEY);
  if (lastSent === reportDate) {
    return NextResponse.json({ ok: true, skipped: "already sent today" });
  }

  const { locale } = await getI18n();
  const report = await generateDailyReport(locale);
  if (!report) {
    return NextResponse.json({ ok: false, reason: "no orders yesterday" });
  }

  const delivery = await queueDailyWhatsAppReport(context, {
    reportDate,
    phone,
    text: report.message,
  });
  const state = delivery.effect.state;
  const accepted = ["queued", "processing", "retrying"].includes(state);
  const succeeded = state === "succeeded";

  let markerPersisted = false;
  if (succeeded) {
    try {
      await db.setting.upsert({
        where: { key: DAILY_REPORT_LAST_SENT_KEY },
        create: { key: DAILY_REPORT_LAST_SENT_KEY, value: reportDate },
        update: { value: reportDate },
      });
      markerPersisted = true;
    } catch {
      // The same exact effect is replayed next time. A confirmed provider
      // receipt prevents another send while allowing this projection to heal.
    }
  }

  const status = succeeded ? 200 : accepted ? 202 : 409;
  return NextResponse.json(
    {
      ok: succeeded,
      accepted: succeeded || accepted,
      report: reportProjection(report),
      reportDate,
      whatsappSent: succeeded,
      markerPersisted,
      messageId: delivery.messageId,
      effectKey: delivery.effectKey,
      state,
      replayed: delivery.replayed,
      attemptCount: delivery.effect.attemptCount,
      nextAttemptAt: delivery.effect.nextAttemptAt,
      errorCode: delivery.effect.errorCode,
      requiresDuplicateConfirmation:
        delivery.effect.requiresDuplicateConfirmation,
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

async function handleReport(
  trigger: "cron" | "manual",
): Promise<NextResponse> {
  return withDemoPolicyLock(() => executeReport(trigger));
}

/** Verify scheduled cron authority without exposing the production secret. */
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
  if (req.nextUrl.searchParams.get("trigger") === "manual") {
    // The in-app Test action is seller-authenticated Settings authority. It
    // never receives or reuses the scheduler secret; the durable WhatsApp
    // effect below remains the actual external-send authority.
    await requireAuth("settings.manage");
    return handleReport("manual");
  }

  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleReport("cron");
}, "POST /api/reports/daily");

/** GET is deliberately non-mutating; report delivery is POST-only. */
export const GET = withErrorHandler(
  async () =>
    NextResponse.json(
      { error: "Daily report delivery requires POST" },
      { status: 405, headers: { Allow: "POST" } },
    ),
  "GET /api/reports/daily",
);
