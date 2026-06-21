import { NextRequest, NextResponse } from "next/server";
import { listWilayaRisks, seedWilayaRiskProfiles, assessOrderRisk } from "@/lib/wilaya-risk/engine";

export const dynamic = "force-dynamic";

/** GET /api/wilaya-risk — list all risk profiles (or assess a single wilaya). */
export async function GET(req: NextRequest) {
  try {
    const wilaya = req.nextUrl.searchParams.get("wilaya");
    const seed = req.nextUrl.searchParams.get("seed");

    // Seed on demand (?seed=true) — idempotent
    if (seed === "true") {
      const result = await seedWilayaRiskProfiles();
      return NextResponse.json({ ok: true, ...result });
    }

    // Assess a single wilaya (?wilaya=Oran)
    if (wilaya) {
      const assessment = await assessOrderRisk(wilaya);
      return NextResponse.json({ wilaya, ...assessment });
    }

    // List all
    const risks = await listWilayaRisks();
    return NextResponse.json({ risks, count: risks.length });
  } catch (err) {
    console.error("[GET /api/wilaya-risk]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
