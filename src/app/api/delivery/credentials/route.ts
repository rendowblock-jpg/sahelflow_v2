import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  setSecret,
  deleteSecret,
  hasSecret,
} from "@/lib/secrets";
import { deliverySecretKey, deliverySecretKeys, DELIVERY_PROVIDERS } from "@/lib/integrations/delivery/types";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivery/credentials — status of all delivery provider credentials.
 * Returns which providers are configured (never the values).
 */
export const GET = withErrorHandler(async () => {
  await requireAuth("delivery.credentials.manage");
  await requireRecentReauthentication();
  const context = { prisma: db, shop: shopContext };
  const status: Record<string, Record<string, boolean>> = {};
  for (const provider of DELIVERY_PROVIDERS) {
    const keys = deliverySecretKeys(provider);
    const fieldStatus: Record<string, boolean> = {};
    for (const key of keys) {
      // Extract field name from the canonical camelCase loader key:
      //   delivery_yalidine_apiId → "apiId"
      //   delivery_zrexpress_apiKey → "apiKey"
      // The keys come from deliverySecretKeys() which is the canonical
      // camelCase shape — UI + POST route must use the same camelCase field
      // names or the loader finds nothing (bug B3 / dive-5).
      const fieldMatch = key.match(/^delivery_(\w+)_(.+)$/);
      const field = fieldMatch ? fieldMatch[2]! : key;
      fieldStatus[field] = await hasSecret(context, key);
    }
    status[provider] = fieldStatus;
  }
  return NextResponse.json({ providers: status });
}, "GET /api/delivery/credentials");

const saveSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress", "dhd"]),
  credentials: z.record(z.string(), z.string().min(1)),
});

/**
 * POST /api/delivery/credentials — save credentials for a provider (encrypted).
 * Body: { provider: "yalidine", credentials: { apiId: "...", apiToken: "..." } }
 *
 * CRITICAL: field names in `credentials` MUST be camelCase (apiId, apiToken,
 * apiKey) to match deliverySecretKeys() in src/lib/integrations/delivery/types.ts.
 * Each value is stored as `delivery_${provider}_${field}` — so camelCase here
 * becomes `delivery_yalidine_apiId`, which is exactly what the loader looks up.
 * Sending snake_case (api_id) would store `delivery_yalidine_api_id` → loader
 * finds nothing → every adapter call fails with "Identifiants manquants"
 * (bug B3 / dive-5). Tests bypass the loader with mocks so CI stays green.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("delivery.credentials.manage");
  const context = { prisma: db, shop: shopContext };
  const body = await req.json();
  const input = saveSchema.parse(body);

  // Save each credential field to the Secret store
  for (const [field, value] of Object.entries(input.credentials)) {
    const key = deliverySecretKey(input.provider, field);
    await setSecret(context, key, value);
  }
  await logAudit(context, {
    action: "delivery.credentials.updated",
    entity: "delivery_credentials",
    entityId: input.provider,
    actor: trustedActorAuditIdentity(actorContext.actor),
    metadata: { provider: input.provider, fields: Object.keys(input.credentials) },
  });

  return NextResponse.json({
    ok: true,
    message: `Identifiants ${input.provider} enregistrés (chiffrés).`,
  });
}, "POST /api/delivery/credentials");

const deleteSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress", "dhd"]),
});

/**
 * DELETE /api/delivery/credentials?provider=yalidine — remove all credentials
 * for a provider.
 */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("delivery.credentials.manage");
  await requireRecentReauthentication();
  const context = { prisma: db, shop: shopContext };
  const provider = req.nextUrl.searchParams.get("provider");
  const input = deleteSchema.parse({ provider });

  const keys = deliverySecretKeys(input.provider);
  // Capture before-state (which keys were actually present?) for audit.
  const before: Record<string, boolean> = {};
  for (const key of keys) {
    before[key] = await hasSecret(context, key);
    await deleteSecret(context, key);
  }

  // W2-5: audit credential deletion (security-relevant — strips delivery integration access).
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "delivery.credentials.deleted",
    entity: "delivery_credentials",
    entityId: input.provider,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: before as unknown as Record<string, unknown>,
    metadata: { provider: input.provider, keys },
  });

  return NextResponse.json({
    ok: true,
    message: `Identifiants ${input.provider} supprimés.`,
  });
}, "DELETE /api/delivery/credentials");
