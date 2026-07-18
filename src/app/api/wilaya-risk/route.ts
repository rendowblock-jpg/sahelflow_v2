import { NextRequest, NextResponse } from "next/server";
import { listWilayaRisks, seedWilayaRiskProfiles, assessOrderRisk } from "@/lib/wilaya-risk/engine";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/wilaya-risk — list all risk profiles (or assess a single wilaya). */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const wilaya = req.nextUrl.searchParams.get("wilaya");
  const seed = req.nextUrl.searchParams.get("seed");
  const context = { prisma: db, shop: shopContext };

  // Seed on demand (?seed=true) — idempotent
  if (seed === "true") {
    const result = await seedWilayaRiskProfiles(context);
    return NextResponse.json({ ok: true, ...result });
  }

  // Assess a single wilaya (?wilaya=Oran)
  if (wilaya) {
    const assessment = await assessOrderRisk(context, wilaya);
    return NextResponse.json({ wilaya, ...assessment });
  }

  // List all
  const risks = await listWilayaRisks(context);
  return NextResponse.json({ risks, count: risks.length });
}, "GET /api/wilaya-risk");
