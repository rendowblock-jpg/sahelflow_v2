import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { storefrontStudioThemeSchema } from "@/lib/storefront/studio-schema";
import { normalizeStorefrontTheme } from "@/lib/storefront/theme-normalize";

export const dynamic = "force-dynamic";

/**
 * GET /api/storefront/config
 *   No query params → list all storefronts (seller management view, includes inactive).
 *   ?slug=...       → public storefront config + products (for the public storefront page).
 *                    Only returns active storefronts.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const slug = req.nextUrl.searchParams.get("slug");

  // Public path: fetch by slug for the storefront page
  if (slug) {
    const { storefrontService } = await import("@/lib/storefront/service");
    const config = await storefrontService.getBySlug(
      { prisma: db, shop: shopContext },
      slug,
    );
    if (!config || !config.isActive) {
      return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
    }

    const products = config.productIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: config.productIds }, isActive: true, deletedAt: null },
          select: { id: true, name: true, price: true, sku: true, images: true, stock: true },
        })
      : [];

    return NextResponse.json({ config, products });
  }

  // Seller path: list all storefronts (management view)
  // A-H1: the seller-management branch (no ?slug=) must require auth — it
  // lists ALL storefronts incl. inactive. The public ?slug= branch above
  // stays public (correct — renders the public storefront page).
  await requireTrustedAction("storefront.read");
  const { storefrontService } = await import("@/lib/storefront/service");
  const configs = await storefrontService.list({ prisma: db, shop: shopContext });
  return NextResponse.json({ configs });
}, "GET /api/storefront/config");

const legacyThemeSchema = z.object({
  template: z.enum(["minimal", "modern", "classic"]),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  showPrices: z.boolean().default(true),
  showStock: z.boolean().default(false),
}).strict();
const writableThemeSchema = z.union([storefrontStudioThemeSchema, legacyThemeSchema])
  .transform((value) => normalizeStorefrontTheme(value));

const createConfigSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase, digits, or hyphens"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  theme: writableThemeSchema,
  productIds: z.array(z.string().min(2).max(128)).max(500).default([]),
  contact: z.object({
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
  }).strict().optional(),
  isActive: z.boolean().optional(),
}).strict();

/** POST /api/storefront/config — create a new storefront config (seller-only). */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("storefront.manage");
  assertTrustedAction(actorContext, "storefront.publish");
  const body = await req.json();
  const input = createConfigSchema.parse(body);

  const { storefrontService, DEFAULT_THEME } = await import("@/lib/storefront/service");
  const config = await storefrontService.create({ prisma: db, shop: shopContext }, {
    slug: input.slug,
    name: input.name,
    description: input.description,
    theme: input.theme,
    productIds: input.productIds,
    contact: input.contact,
    isActive: input.isActive,
  });
  void DEFAULT_THEME;
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "storefront.created",
      entity: "storefront",
      entityId: config.id,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: config as unknown as Record<string, unknown>,
    },
  );
  return NextResponse.json({ config }, { status: 201 });
}, "POST /api/storefront/config");
