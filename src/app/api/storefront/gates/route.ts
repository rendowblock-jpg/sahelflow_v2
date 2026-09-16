import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import {
  gatesConfigSchema,
  getStorefrontGatesConfig,
  saveStorefrontGatesConfig,
} from "@/lib/storefront/gates-service";

export const dynamic = "force-dynamic";

const readSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

/**
 * FD-061 EX-4: seller configuration of the storefront checkout gates
 * (Turnstile bot protection + WhatsApp OTP phone verification).
 * GET — read one storefront's gate config (storefront.read). Secrets are
 *      never echoed — only presence booleans.
 * PUT — save (storefront.manage, audit-logged). Secret semantics: empty
 *      keeps, "-" clears, a value replaces. Arming a gate without its
 *      secret is rejected.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireTrustedAction("storefront.read");
  const input = readSchema.parse({
    slug: req.nextUrl.searchParams.get("slug") ?? undefined,
  });
  const config = await getStorefrontGatesConfig(
    { prisma: db, shop: shopContext },
    input.slug,
  );
  return NextResponse.json({ config });
}, "GET /api/storefront/gates");

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("storefront.manage");
  const input = gatesConfigSchema.parse(await req.json());

  const config = await saveStorefrontGatesConfig(
    { prisma: db, shop: shopContext },
    input,
  );
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "storefrontgateconfig.saved",
      entity: "storefrontGateConfig",
      entityId: config.storefrontSlug,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: {
        storefrontSlug: config.storefrontSlug,
        otpEnabled: config.otpEnabled,
        otpLanguage: config.otpLanguage,
        turnstileEnabled: config.turnstileEnabled,
        turnstileSiteKey: config.turnstileSiteKey,
        hasDzverifyApiKey: config.hasDzverifyApiKey,
        hasTurnstileSecretKey: config.hasTurnstileSecretKey,
      } as unknown as Record<string, unknown>,
    },
  );
  return NextResponse.json({ config });
}, "PUT /api/storefront/gates");
