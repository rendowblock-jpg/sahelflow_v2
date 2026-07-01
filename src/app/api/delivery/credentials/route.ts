import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  setSecret,
  deleteSecret,
  hasSecret,
} from "@/lib/secrets";
import { deliverySecretKey, deliverySecretKeys, DELIVERY_PROVIDERS } from "@/lib/integrations/delivery/types";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivery/credentials — status of all delivery provider credentials.
 * Returns which providers are configured (never the values).
 */
export const GET = withErrorHandler(async () => {
  const status: Record<string, Record<string, boolean>> = {};
  for (const provider of DELIVERY_PROVIDERS) {
    const keys = deliverySecretKeys(provider);
    const fieldStatus: Record<string, boolean> = {};
    for (const key of keys) {
      // Extract field name: delivery_yalidine_api_id → api_id
      const fieldMatch = key.match(/^delivery_\w+_(.+)$/);
      const field = fieldMatch ? fieldMatch[1]! : key;
      fieldStatus[field] = await hasSecret(key);
    }
    status[provider] = fieldStatus;
  }
  return NextResponse.json({ providers: status });
}, "GET /api/delivery/credentials");

const saveSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress"]),
  credentials: z.record(z.string(), z.string().min(1)),
});

/**
 * POST /api/delivery/credentials — save credentials for a provider (encrypted).
 * Body: { provider: "yalidine", credentials: { api_id: "...", api_token: "..." } }
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = saveSchema.parse(body);

  // Save each credential field to the Secret store
  for (const [field, value] of Object.entries(input.credentials)) {
    const key = deliverySecretKey(input.provider, field);
    await setSecret(key, value);
  }

  return NextResponse.json({
    ok: true,
    message: `Identifiants ${input.provider} enregistrés (chiffrés).`,
  });
}, "POST /api/delivery/credentials");

const deleteSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress"]),
});

/**
 * DELETE /api/delivery/credentials?provider=yalidine — remove all credentials
 * for a provider.
 */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const provider = req.nextUrl.searchParams.get("provider");
  const input = deleteSchema.parse({ provider });

  const keys = deliverySecretKeys(input.provider);
  for (const key of keys) {
    await deleteSecret(key);
  }

  return NextResponse.json({
    ok: true,
    message: `Identifiants ${input.provider} supprimés.`,
  });
}, "DELETE /api/delivery/credentials");
