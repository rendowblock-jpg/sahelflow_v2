import { NextRequest, NextResponse } from "next/server";
import { getRiskRules, saveRiskRules } from "@/lib/risk-engine";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/risk/rules — list all risk rules */
export async function GET() {
  await requireAuth();
  const rules = await getRiskRules();
  return NextResponse.json({ rules });
}

/** PUT /api/risk/rules — replace all rules */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  // SEC-021: validate shape with Zod (was: bare `as { rules: RiskRule[] }`).
  // The rule DSL is complex (discriminated unions for conditions + effects);
  // full validation is done in the risk engine on assessment. Here we just
  // ensure the top-level shape is correct.
  const body = z.object({ rules: z.array(z.record(z.string(), z.unknown())) }).parse(await req.json());
  await saveRiskRules(body.rules as never);
  return NextResponse.json({ rules: body.rules });
}, "PUT /api/risk/rules");
