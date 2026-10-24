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
import { ECOMMERCE_SECRET_KEYS } from "@/lib/integrations/ecommerce/types";

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
const siteUrlSchema = z.string().url();

/**
 * INT-13: only the secret fields a provider DECLARES (ECOMMERCE_SECRET_KEYS)
 * are stored. Order is the write order. Any other supplied field is ignored.
 */
const CREDENTIAL_FIELDS = [
  "accessToken",
  "shopDomain",
  "siteUrl",
  "consumerKey",
  "consumerSecret",
] as const;

/**
 * Every field name this route has ever stored under `ecommerce_<provider>_`.
 * Older builds stored any of them for any provider, so a leftover can only be
 * one of these. Naming them avoids a prefix scan that could hit other keys.
 */
const EVER_STORED_FIELDS = [
  ...CREDENTIAL_FIELDS,
  "apiToken",
  "apiId",
  "apiKey",
] as const;

const ConnectSchema = z
  .object({
    provider: z.enum(["shopify", "woocommerce", "youcan"]),
    accessToken: credentialString,
    shopDomain: credentialString,
    siteUrl: credentialString,
    consumerKey: credentialString,
    consumerSecret: credentialString,
  })
  .superRefine((data, ctx) => {
    const declared = ECOMMERCE_SECRET_KEYS[data.provider];
    // A URL check only matters where the provider really stores a site URL.
    if (
      declared.siteUrl &&
      data.siteUrl !== undefined &&
      !siteUrlSchema.safeParse(data.siteUrl).success
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["siteUrl"],
        message: "Invalid URL",
      });
    }
    // I-M4: a connect with nothing to store would only create an empty row.
    if (!CREDENTIAL_FIELDS.some((field) => declared[field] && data[field])) {
      ctx.addIssue({
        code: "custom",
        message: "At least one credential field required",
      });
    }
  });

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

  const { provider } = parsed.data;
  const declared = ECOMMERCE_SECRET_KEYS[provider];
  const context = { prisma: db, shop: shopContext };
  // Only declared fields the seller actually typed. A declared field left out
  // is never cleared: the settings dialog opens empty and sends just the edits.
  const credentials: Array<[field: string, secretKey: string, value: string]> =
    [];
  for (const field of CREDENTIAL_FIELDS) {
    const secretKey = declared[field];
    const value = parsed.data[field];
    if (secretKey && value) credentials.push([field, secretKey, value]);
  }
  const staleSecretKeys = EVER_STORED_FIELDS.filter(
    (field) => !declared[field],
  ).map((field) => `ecommerce_${provider}_${field}`);

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
        fields: credentials.map(([field]) => field),
      },
    });
  });

  // Secrets are written after the row. A failure mid-way triggers compensating
  // cleanup: delete the secrets already written and deactivate the row, then
  // surface a coded 502 instead of leaving a half-connected integration.
  const writtenSecretKeys: string[] = [];
  try {
    // Leftovers of an undeclared field are dropped first, so nothing a loader
    // never reads (and the seller never sees) stays stored. Idempotent.
    for (const secretKey of staleSecretKeys) {
      await deleteSecret(context, secretKey);
    }
    for (const [, secretKey, value] of credentials) {
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
