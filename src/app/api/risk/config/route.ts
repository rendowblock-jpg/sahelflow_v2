import { NextRequest, NextResponse } from "next/server";
import { getRiskConfig, saveRiskConfig } from "@/lib/risk-engine";
import type { RiskEngineConfig } from "@/lib/risk-engine";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/risk/config — load the risk engine configuration */
export async function GET() {
  const config = await getRiskConfig();
  return NextResponse.json({ config });
}

/** PUT /api/risk/config — update the risk engine configuration */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json() as Partial<RiskEngineConfig>;
  const current = await getRiskConfig();
  const merged: RiskEngineConfig = {
    weights: { ...current.weights, ...body.weights },
    thresholds: { ...current.thresholds, ...body.thresholds },
    autoActions: { ...current.autoActions, ...body.autoActions },
    autoBlacklistReturnRate: body.autoBlacklistReturnRate ?? current.autoBlacklistReturnRate,
  };
  await saveRiskConfig(merged);
  return NextResponse.json({ config: merged });
}, "PUT /api/risk/config");
