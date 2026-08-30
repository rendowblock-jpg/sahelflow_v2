import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getRiskConfig, saveRiskConfig } from "@/lib/risk-engine";
import type { RiskEngineConfig } from "@/lib/risk-engine";
import { normalizeRiskConfig } from "@/lib/risk-engine/config-normalization";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

function digestJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

/** Weight multipliers are bounded 0-2 by the scoring engine. */
const WEIGHT = z.number().finite().min(0).max(2);

/** A3: the PUT body was a bare `as Partial<RiskEngineConfig>` cast — garbage
 * (wrong types, out-of-range numbers, unknown keys) was persisted raw and
 * echoed back. The schema mirrors the engine's documented field ranges; the
 * engine's own normalization remains the single authority for what is
 * finally stored and returned. */
const ConfigPutSchema = z.object({
  weights: z.object({
    customerHistory: WEIGHT.optional(),
    geography: WEIGHT.optional(),
    orderValue: WEIGHT.optional(),
    contactQuality: WEIGHT.optional(),
    behavior: WEIGHT.optional(),
  }).strict().optional(),
  thresholds: z.object({
    low: z.number().finite().min(0).max(100).optional(),
    medium: z.number().finite().min(0).max(100).optional(),
    high: z.number().finite().min(0).max(100).optional(),
  }).strict().optional(),
  autoActions: z.object({
    autoConfirmLow: z.boolean().optional(),
    autoHoldCritical: z.boolean().optional(),
    autoFlagBlacklist: z.boolean().optional(),
  }).strict().optional(),
  autoBlacklistReturnRate: z.number().finite().min(0).max(1).optional(),
}).strict();

/** GET /api/risk/config — load the risk engine configuration */
export const GET = withErrorHandler(async () => {
  await requireAuth("risk.read");
  const config = await getRiskConfig({ prisma: db, shop: shopContext });
  return NextResponse.json({ config });
}, "GET /api/risk/config");

/** PUT /api/risk/config — update the risk engine configuration */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("risk.manage");
  const parsed = ConfigPutSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid risk engine configuration" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const context = { prisma: db, shop: shopContext };
  const current = await getRiskConfig(context);
  const merged: RiskEngineConfig = {
    weights: { ...current.weights, ...body.weights },
    thresholds: { ...current.thresholds, ...body.thresholds },
    autoActions: { ...current.autoActions, ...body.autoActions },
    autoBlacklistReturnRate: body.autoBlacklistReturnRate ?? current.autoBlacklistReturnRate,
  };
  // Engine invariant: level thresholds must be strictly ascending. Reject
  // the request instead of persisting a config whose reads would silently
  // fall back to defaults.
  const { low, medium, high } = merged.thresholds;
  if (!(low < medium && medium < high)) {
    return NextResponse.json(
      { error: "Risk thresholds must be strictly ascending (low < medium < high)" },
      { status: 400 },
    );
  }
  const config = normalizeRiskConfig(merged);
  await saveRiskConfig(context, config);
  // A2: this configuration gates auto-confirmation, auto-holds and
  // auto-blacklisting — replacing it is an audited authority change.
  await logAudit(context, {
    action: "risk.config.update",
    entity: "risk-engine",
    entityId: "config",
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: { digest: digestJson(current) },
    after: { digest: digestJson(config) },
  });
  return NextResponse.json({ config });
}, "PUT /api/risk/config");
