import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { storefrontStudioThemeSchema } from "@/lib/storefront/studio-schema";
import { normalizeStorefrontTheme } from "@/lib/storefront/theme-normalize";

export const dynamic = "force-dynamic";

const legacyThemeSchema = z.object({
  template: z.enum(["minimal", "modern", "classic"]),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  showPrices: z.boolean(),
  showStock: z.boolean(),
}).strict();
const writableThemeSchema = z.union([storefrontStudioThemeSchema, legacyThemeSchema])
  .transform((value) => normalizeStorefrontTheme(value));

const updateConfigSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase, digits, or hyphens").optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  theme: writableThemeSchema.optional(),
  productIds: z.array(z.string().min(2).max(128)).max(500).optional(),
  contact: z.object({
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
  }).strict().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

const saveDraftSchema = z.object({
  expectedDraftUpdatedAt: z.string().datetime().nullable(),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase, digits, or hyphens"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  theme: writableThemeSchema,
  productIds: z.array(z.string().min(2).max(128)).min(1).max(500),
  isActive: z.boolean(),
}).strict();

const publishDraftSchema = z.object({
  expectedDraftUpdatedAt: z.string().datetime(),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/storefront/config/[id]
 *   Seller-only: fetch a storefront config by id (includes inactive storefronts).
 */
export const GET = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  // W2-4: defense-in-depth — GET was unprotected, exposed inactive storefront configs to anyone.
  await requireTrustedAction("storefront.read");
  const { id } = await params;
  const { storefrontService } = await import("@/lib/storefront/service");
  const config = await storefrontService.getById({ prisma: db, shop: shopContext }, id);
  if (!config) {
    return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
  }
  return NextResponse.json({ config });
}, "GET /api/storefront/config/[id]");

/**
 * PUT /api/storefront/config/[id]
 *   Seller-only: update a storefront config. Partial updates supported.
 */
export const PUT = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("storefront.manage");
  assertTrustedAction(actorContext, "storefront.publish");
  const { id } = await params;
  const body = await req.json();
  const input = updateConfigSchema.parse(body);
  const { expectedUpdatedAt, ...updates } = input;

  const { storefrontService, StorefrontVersionConflictError } = await import("@/lib/storefront/service");

  // Verify the storefront exists before updating (gives a clean 404)
  const context = { prisma: db, shop: shopContext };
  const existing = await storefrontService.getById(context, id);
  if (!existing) {
    return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
  }

  let config;
  try {
    config = await storefrontService.update(context, id, updates, { expectedUpdatedAt });
  } catch (error) {
    if (error instanceof StorefrontVersionConflictError) {
      const current = await storefrontService.getById(context, id);
      return NextResponse.json({ error: "version_conflict", config: current }, { status: 409 });
    }
    throw error;
  }
  await logAudit(context, {
    action: "storefront.updated",
    entity: "storefront",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: existing as unknown as Record<string, unknown>,
    after: config as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ config });
}, "PUT /api/storefront/config/[id]");

/**
 * PATCH /api/storefront/config/[id]
 *   Seller-only: compare-and-set a private Studio draft. This never mutates
 *   the public fields consumed by /storefront/[slug].
 */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("storefront.manage");
  assertTrustedAction(actorContext, "storefront.publish");
  const { id } = await params;
  const input = saveDraftSchema.parse(await req.json());
  const { expectedDraftUpdatedAt, ...draft } = input;
  const context = { prisma: db, shop: shopContext };
  const { storefrontService, StorefrontVersionConflictError } = await import("@/lib/storefront/service");
  if (!(await storefrontService.getById(context, id))) {
    return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
  }
  try {
    const config = await storefrontService.saveStudioDraft(context, id, draft, {
      expectedDraftUpdatedAt,
    });
    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof StorefrontVersionConflictError) {
      const config = await storefrontService.getStudioDraftById(context, id);
      return NextResponse.json({ error: "version_conflict", config }, { status: 409 });
    }
    throw error;
  }
}, "PATCH /api/storefront/config/[id]");

/**
 * POST /api/storefront/config/[id]
 *   Seller-only: explicitly publish the exact saved Studio draft to the local
 *   public storefront using a compare-and-set draft version.
 */
export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("storefront.publish");
  const { id } = await params;
  const input = publishDraftSchema.parse(await req.json());
  const context = { prisma: db, shop: shopContext };
  const { storefrontService, StorefrontVersionConflictError } = await import("@/lib/storefront/service");
  const before = await storefrontService.getById(context, id);
  if (!before) return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
  try {
    const config = await storefrontService.publishStudioDraft(context, id, input);
    await logAudit(context, {
      action: "storefront.published",
      entity: "storefront",
      entityId: id,
      actor: trustedActorAuditIdentity(actorContext.actor),
      before: before as unknown as Record<string, unknown>,
      after: config as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof StorefrontVersionConflictError) {
      const config = await storefrontService.getStudioDraftById(context, id);
      return NextResponse.json({ error: "version_conflict", config }, { status: 409 });
    }
    throw error;
  }
}, "POST /api/storefront/config/[id]");

/**
 * DELETE /api/storefront/config/[id]
 *   Seller-only: permanently delete a storefront config.
 */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("storefront.manage");
  assertTrustedAction(actorContext, "storefront.publish");
  assertTrustedAction(actorContext, "approvals.approve");
  await requireRecentReauthentication();
  const { id } = await params;
  const { storefrontService } = await import("@/lib/storefront/service");

  const context = { prisma: db, shop: shopContext };
  const existing = await storefrontService.getById(context, id);
  if (!existing) {
    return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
  }

  await storefrontService.delete(context, id);
  // W2-5: audit the delete (existing captured above).
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "storefront.deleted",
    entity: "storefront",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: existing as unknown as Record<string, unknown> | null,
  });
  return NextResponse.json({ ok: true });
}, "DELETE /api/storefront/config/[id]");
