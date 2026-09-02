import { NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext, type DbClient } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { deleteSecret, setSecret } from "@/lib/secrets";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { SahelFlowError } from "@/types/errors";

/**
 * Connect an e-commerce integration (YouCan, Shopify, WooCommerce).
 * Stores credentials in the Secret table + creates/updates an Integration record.
 *
 * I-M4: provider is constrained to a known enum (was `z.string().min(1)` which
 * accepted any string and let `db.integration.upsert` create rows for unknown
 * platforms). At least one credential field is required (was all-optional,
 * which let a no-credentials POST create a useless Integration row).
 * Audit S2-8: credential strings are bounded (≤2048) — they are tokens/keys,
 * not free-text fields.
 */
const credentialString = z.string().max(2048).optional();

const ConnectSchema = z
  .object({
    provider: z.enum(["shopify", "woocommerce", "youcan"]),
    accessToken: credentialString,
    shopDomain: credentialString,
    siteUrl: z.string().url().max(2048).optional(),
    consumerKey: credentialString,
    consumerSecret: credentialString,
    apiToken: credentialString,
    apiId: credentialString,
    apiKey: credentialString,
  })
  .refine(
    (data) =>
      Boolean(
        data.accessToken ||
          data.shopDomain ||
          data.siteUrl ||
          data.consumerKey ||
          data.consumerSecret ||
          data.apiToken ||
          data.apiId ||
          data.apiKey,
      ),
    { message: "At least one credential field required" },
  );

export const POST = withErrorHandler(async (req: Request) => {
  const actorContext = await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const body = await req.json();
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) {
    // Audit S2-8: coded 400 on the safeParse rejection.
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid data",
        code: "REQUEST_VALIDATION_FAILED",
      },
      { status: 400 },
    );
  }

  const { provider, ...creds } = parsed.data;
  const context = { prisma: db, shop: shopContext };
  const credentials = Object.entries(creds).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );

  // Audit S2-8: the Integration row is upserted FIRST, in one transaction with
  // its audit record, so secrets can never exist without their owning row.
  await db.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: { platform: provider },
      create: {
        platform: provider,
        type: "ecommerce",
        isActive: true,
      },
      update: {
        isActive: true,
      },
    });

    // The interactive-transaction client is not the extended DbClient — use
    // the established cast idiom (settings route, ai actions executor).
    await logAudit({ ...context, prisma: tx as unknown as DbClient }, {
      action: "integration.credentials.updated",
      entity: "integration",
      entityId: provider,
      actor: trustedActorAuditIdentity(actorContext.actor),
      metadata: {
        provider,
        fields: credentials.map(([key]) => key),
      },
    });
  });

  // Secrets are written after the row. A failure mid-way triggers compensating
  // cleanup: delete the secrets already written and deactivate the row, then
  // surface a coded 502 instead of leaving a half-connected integration.
  const writtenSecretKeys: string[] = [];
  try {
    for (const [key, value] of credentials) {
      const secretKey = `ecommerce_${provider}_${key}`; // was integration_ — mismatched loader
      await setSecret(context, secretKey, value);
      writtenSecretKeys.push(secretKey);
    }
  } catch (error) {
    logger.error(
      "api.POST /api/integrations/connect.partial-failure",
      error instanceof Error ? error : undefined,
      { provider, writtenSecretCount: writtenSecretKeys.length },
    );
    for (const secretKey of writtenSecretKeys) {
      await deleteSecret(context, secretKey).catch(() => undefined);
    }
    await db.integration
      .updateMany({ where: { platform: provider }, data: { isActive: false } })
      .catch(() => undefined);
    throw new SahelFlowError(
      "Integration credentials were only partially stored; the connection was rolled back",
      "CONNECT_PARTIAL_FAILURE",
      502,
    );
  }

  return NextResponse.json({ success: true, provider });
}, "POST /api/integrations/connect");
