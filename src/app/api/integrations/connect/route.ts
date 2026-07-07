import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { setSecret } from "@/lib/secrets";

/**
 * Connect an e-commerce integration (YouCan, Shopify, WooCommerce).
 * Stores credentials in the Secret table + creates/updates an Integration record.
 *
 * I-M4: provider is constrained to a known enum (was `z.string().min(1)` which
 * accepted any string and let `db.integration.upsert` create rows for unknown
 * platforms). At least one credential field is required (was all-optional,
 * which let a no-credentials POST create a useless Integration row).
 */
const ConnectSchema = z
  .object({
    provider: z.enum(["shopify", "woocommerce", "youcan"]),
    accessToken: z.string().optional(),
    shopDomain: z.string().optional(),
    siteUrl: z.string().url().optional(),
    consumerKey: z.string().optional(),
    consumerSecret: z.string().optional(),
    apiToken: z.string().optional(),
    apiId: z.string().optional(),
    apiKey: z.string().optional(),
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
  await requireAuth();
  const body = await req.json();
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }

  const { provider, ...creds } = parsed.data;

  // Store each credential as a secret
  const secretPromises: Promise<void>[] = [];
  for (const [key, value] of Object.entries(creds)) {
    if (value) {
      const secretKey = `ecommerce_${provider}_${key}`;  // was integration_ — mismatched loader
      secretPromises.push(setSecret(secretKey, value));
    }
  }
  await Promise.all(secretPromises);

  // Create or update the Integration record
  await db.integration.upsert({
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

  return NextResponse.json({ success: true, provider });
}, "POST /api/integrations/connect");
