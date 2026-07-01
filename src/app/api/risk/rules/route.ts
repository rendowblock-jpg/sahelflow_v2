import { NextRequest, NextResponse } from "next/server";
import { getRiskRules, saveRiskRules } from "@/lib/risk-engine";
import type { RiskRule } from "@/lib/risk-engine";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/risk/rules — list all risk rules */
export async function GET() {
  const rules = await getRiskRules();
  return NextResponse.json({ rules });
}

/** PUT /api/risk/rules — replace all rules */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json() as { rules: RiskRule[] };
  await saveRiskRules(body.rules);
  return NextResponse.json({ rules: body.rules });
}, "PUT /api/risk/rules");
