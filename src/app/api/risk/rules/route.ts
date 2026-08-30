import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getRiskRules, saveRiskRules } from "@/lib/risk-engine";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

function digestJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

/** GET /api/risk/rules — list all risk rules */
export const GET = withErrorHandler(async () => {
  await requireAuth("risk.read");
  const rules = await getRiskRules({ prisma: db, shop: shopContext });
  return NextResponse.json({ rules });
}, "GET /api/risk/rules");

/** PUT /api/risk/rules — replace all rules */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("risk.manage");
  // SEC-021: validate shape with Zod (was: bare `as { rules: RiskRule[] }`).
  // The rule DSL is complex (discriminated unions for conditions + effects);
  // full validation is done in the risk engine on assessment. Here we just
  // ensure the top-level shape is correct.
  const body = z.object({ rules: z.array(z.record(z.string(), z.unknown())) }).parse(await req.json());
  const context = { prisma: db, shop: shopContext };
  const before = await getRiskRules(context);
  await saveRiskRules(context, body.rules as never);
  // A2: the rule set drives automated risk decisions — replacing it wholesale
  // is an audited authority change (digests keep the row small; the replaced
  // rules are echoed to the caller for immediate verification).
  await logAudit(context, {
    action: "risk.rules.replace",
    entity: "risk-engine",
    entityId: "rules",
    actor: trustedActorAuditIdentity(actorContext.actor),
    // Digest keys use the machine-code suffix convention so the redaction
    // authority preserves them (see the config route note).
    before: { count: before.length, beforeDigestCode: digestJson(before) },
    after: { count: body.rules.length, afterDigestCode: digestJson(body.rules) },
  });
  return NextResponse.json({ rules: body.rules });
}, "PUT /api/risk/rules");
