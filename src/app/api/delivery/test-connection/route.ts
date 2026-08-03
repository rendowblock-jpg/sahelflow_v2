import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { testAndCertifyProvider } from "@/lib/integrations/delivery/provider-capability";

export const dynamic = "force-dynamic";

const testSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress", "noest"]),
  reasonCode: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/i)
    .default("settings_manual_certification"),
});

/**
 * POST /api/delivery/test-connection — test and certify the exact current
 * provider credential + endpoint contract without creating a shipment.
 * Certification is invalidated automatically when any credential changes.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("delivery.credentials.manage");
  await requireRecentReauthentication();
  const input = testSchema.parse(await req.json());
  const context = { prisma: db, shop: shopContext };
  const actor = trustedActorAuditIdentity(actorContext.actor);
  const result = await testAndCertifyProvider(
    context,
    input.provider,
    actor,
    input.reasonCode,
  );

  await logAudit(context, {
    action: result.ok
      ? "delivery.provider.certified"
      : "delivery.provider.certification_failed",
    entity: "delivery_provider",
    entityId: input.provider,
    actor,
    metadata: {
      provider: input.provider,
      reasonCode: input.reasonCode,
      certified: result.ok,
      expiresAt: result.expiresAt ?? null,
    },
  });

  return NextResponse.json(result);
}, "POST /api/delivery/test-connection");
