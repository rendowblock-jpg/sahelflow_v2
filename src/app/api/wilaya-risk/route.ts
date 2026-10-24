import { NextRequest, NextResponse } from "next/server";
import { listWilayaRisks, seedWilayaRiskProfiles, assessOrderRisk } from "@/lib/wilaya-risk/engine";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** GET /api/wilaya-risk — pure read: list profiles or assess one wilaya. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("risk.read");
  const wilaya = req.nextUrl.searchParams.get("wilaya");
  const seed = req.nextUrl.searchParams.get("seed");
  const context = { prisma: db, shop: shopContext };

  // Seeding used to mutate state through GET. Reject the legacy shape so
  // callers cannot mistake a read for an authorized configuration write.
  if (seed === "true") {
    return NextResponse.json(
      { error: "Use POST /api/wilaya-risk to seed risk profiles." },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  // Assess a single wilaya (?wilaya=Oran&locale=ar). Text is French unless a
  // supported locale is asked for.
  if (wilaya) {
    const asked = req.nextUrl.searchParams.get("locale") ?? "";
    const locale = (LOCALES as readonly string[]).includes(asked) ? (asked as Locale) : DEFAULT_LOCALE;
    const assessment = await assessOrderRisk(context, wilaya, locale);
    return NextResponse.json({ wilaya, ...assessment });
  }

  // List all
  const risks = await listWilayaRisks(context);
  return NextResponse.json({ risks, count: risks.length });
}, "GET /api/wilaya-risk");

/** POST /api/wilaya-risk — idempotently seed the managed risk profiles. */
export const POST = withErrorHandler(async () => {
  await requireAuth("risk.manage");
  const result = await seedWilayaRiskProfiles({ prisma: db, shop: shopContext });
  return NextResponse.json({ ok: true, ...result });
}, "POST /api/wilaya-risk");
