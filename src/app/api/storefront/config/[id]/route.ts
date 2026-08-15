import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { ConnectedPlatformHttpError } from "@/lib/connected-platform/client";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { storefrontStudioThemeSchema } from "@/lib/storefront/studio-schema";
import { normalizeStorefrontTheme } from "@/lib/storefront/theme-normalize";

export const dynamic = "force-dynamic";

const legacyThemeSchema = z
  .object({
    template: z.enum(["minimal", "modern", "classic"]),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    showPrices: z.boolean(),
    showStock: z.boolean(),
  })
  .strict();

const writableThemeSchema = z
  .union([storefrontStudioThemeSchema, legacyThemeSchema])
  .transform((value) => normalizeStorefrontTheme(value));

const saveDraftSchema = z
  .object({
    expectedDraftUpdatedAt: z.string().datetime().nullable(),
    slug: z
      .string()
      .min(2)
      .max(50)
      .regex(
        /^[a-z0-9-]+$/,
        "Slug must be lowercase, digits, or hyphens",
      ),
    name: z.string().min(1).max(100),
    description: z.string().max(500).nullable(),
    theme: writableThemeSchema,
    productIds: z.array(z.string().min(2).max(128)).min(1).max(500),
    isActive: z.boolean(),
  })
  .strict();

const publishDraftSchema = z
  .object({
    expectedDraftUpdatedAt: z.string().datetime(),
    locale: z.enum(["ar", "fr", "en"]).default("ar"),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/storefront/config/[id]
 *   Seller-only: fetch a storefront config by id (includes inactive storefronts).
 */
export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: RouteContext) => {
    await requireTrustedAction("storefront.read");
    const { id } = await params;
    const { storefrontService } = await import("@/lib/storefront/service");
    const config = await storefrontService.getById(
      { prisma: db, shop: shopContext },
      id,
    );
    if (!config) {
      return NextResponse.json(
        { error: "Storefront not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ config });
  },
  "GET /api/storefront/config/[id]",
);

/**
 * PUT /api/storefront/config/[id]
 *
 * Legacy live-config mutation is intentionally disabled. Updating public fields
 * directly can bypass immutable hosted release/pause authority. All storefront
 * edits must compare-and-set the private Studio draft through PATCH, then publish
 * that exact saved draft through POST.
 */
export const PUT = withErrorHandler(async () => {
  await requireTrustedAction("storefront.manage");
  return NextResponse.json(
    {
      error: "storefront_live_update_disabled",
      requiredFlow: "PATCH private Studio draft, then POST exact draft publish",
    },
    { status: 405 },
  );
}, "PUT /api/storefront/config/[id]");

/**
 * PATCH /api/storefront/config/[id]
 *   Seller-only: compare-and-set a private Studio draft. This never mutates
 *   the public fields consumed by /storefront/[slug].
 */
export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    assertTrustedAction(actorContext, "storefront.publish");
    const { id } = await params;
    const input = saveDraftSchema.parse(await req.json());
    const { expectedDraftUpdatedAt, ...draft } = input;
    const context = { prisma: db, shop: shopContext };
    const { storefrontService, StorefrontVersionConflictError } = await import(
      "@/lib/storefront/service"
    );
    if (!(await storefrontService.getById(context, id))) {
      return NextResponse.json(
        { error: "Storefront not found" },
        { status: 404 },
      );
    }
    try {
      const config = await storefrontService.saveStudioDraft(
        context,
        id,
        draft,
        { expectedDraftUpdatedAt },
      );
      return NextResponse.json({ config });
    } catch (error) {
      if (error instanceof StorefrontVersionConflictError) {
        const config = await storefrontService.getStudioDraftById(context, id);
        return NextResponse.json(
          { error: "version_conflict", config },
          { status: 409 },
        );
      }
      throw error;
    }
  },
  "PATCH /api/storefront/config/[id]",
);

/**
 * POST /api/storefront/config/[id]
 *   Seller-only: publish one exact saved Studio draft through a durable,
 *   replayable local + hosted operation. The prepare command snapshots the
 *   draft and protects stock before any network request. Hosted publication or
 *   pause commits next; only the final command promotes that prepared snapshot
 *   into local public fields and reconciles delegated inventory.
 */
export const POST = withErrorHandler(
  async (req: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("storefront.publish");
    const { id } = await params;
    const input = publishDraftSchema.parse(await req.json());
    const context = { prisma: db, shop: shopContext };
    const businessContext = {
      ...context,
      businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
    };
    const { storefrontService, StorefrontVersionConflictError } = await import(
      "@/lib/storefront/service"
    );
    if (!(await storefrontService.getById(context, id))) {
      return NextResponse.json(
        { error: "Storefront not found" },
        { status: 404 },
      );
    }

    try {
      // Enrollment/key authority must exist before the durable prepare command so
      // a configuration failure cannot strand a provisional stock hold.
      const { loadStorefrontRuntime } = await import(
        "@/lib/connected-platform/runtime"
      );
      const runtime = await loadStorefrontRuntime(context, {
        createReceiptKeys: true,
      });
      const {
        finalizeActiveStorefrontPublish,
        finalizePausedStorefrontPublish,
        prepareStorefrontPublish,
      } = await import("@/lib/connected-platform/storefront-delegation");
      const preparedCommand = await prepareStorefrontPublish(businessContext, {
        storefrontId: id,
        expectedDraftUpdatedAt: input.expectedDraftUpdatedAt,
        locale: input.locale,
      });
      const prepared = preparedCommand.result;
      const {
        pauseHostedStorefront,
        publishHostedStorefront,
      } = await import("@/lib/connected-platform/storefront-publisher");

      let hostedRelease: Record<string, unknown>;
      if (prepared.draft.isActive) {
        const hosted = await publishHostedStorefront({
          ...runtime,
          context,
          prepared,
        });
        const finalized = await finalizeActiveStorefrontPublish(
          businessContext,
          prepared,
          hosted,
        );
        hostedRelease = {
          status: "published",
          releaseId: finalized.result.releaseId,
          artifactDigest: finalized.result.artifactDigest,
          prepareReplayed: preparedCommand.replayed,
          finalizeReplayed: finalized.replayed,
        };
      } else {
        const hosted = await pauseHostedStorefront({
          ...runtime,
          context,
          prepared,
        });
        const finalized = await finalizePausedStorefrontPublish(
          businessContext,
          prepared,
          hosted,
        );
        hostedRelease = {
          status: finalized.result.status,
          sourceReleaseId: hosted.sourceReleaseId,
          prepareReplayed: preparedCommand.replayed,
          finalizeReplayed: finalized.replayed,
        };
      }

      const config = await storefrontService.getById(context, id);
      if (!config) {
        throw new Error("Published storefront disappeared after finalization");
      }
      return NextResponse.json({ config, hostedRelease });
    } catch (error) {
      if (error instanceof StorefrontVersionConflictError) {
        const config = await storefrontService.getStudioDraftById(context, id);
        return NextResponse.json(
          { error: "version_conflict", config },
          { status: 409 },
        );
      }
      throw error;
    }
  },
  "POST /api/storefront/config/[id]",
);

/**
 * DELETE /api/storefront/config/[id]
 *   Seller-only: pause any hosted storefront first, reconcile retired unsold
 *   delegation locally, and only then permanently delete the local config.
 */
export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("storefront.manage");
    assertTrustedAction(actorContext, "storefront.publish");
    assertTrustedAction(actorContext, "approvals.approve");
    await requireRecentReauthentication();
    const { id } = await params;
    const { storefrontService } = await import("@/lib/storefront/service");

    const context = { prisma: db, shop: shopContext };
    const existing = await storefrontService.getById(context, id);
    if (!existing) {
      return NextResponse.json(
        { error: "Storefront not found" },
        { status: 404 },
      );
    }

    let hostedPaused = false;
    const { loadConnectedRuntimeIfEnrolled } = await import(
      "@/lib/connected-platform/runtime"
    );
    const connected = await loadConnectedRuntimeIfEnrolled(context);
    if (connected) {
      // Tie the remote idempotency key to this exact live local version. If the
      // storefront is later republished/reactivated, a subsequent delete gets a
      // fresh pause operation instead of replaying a historical pause receipt.
      const operationId = `storefront_pause_delete_${id}_${existing.updatedAt.getTime()}`;
      try {
        const paused = await connected.client.pauseStorefront(id, {
          workspaceId: shopContext.workspaceId,
          operationId,
        });
        const { applyHostedPauseRetirement } = await import(
          "@/lib/connected-platform/storefront-delegation"
        );
        await applyHostedPauseRetirement(context, {
          storefrontId: id,
          operationId,
          transfer: {
            sourceReleaseId: paused.sourceReleaseId,
            retiredAllocations: paused.retiredAllocations,
          },
        });
        hostedPaused = true;
      } catch (error) {
        if (
          !(error instanceof ConnectedPlatformHttpError) ||
          error.status !== 404 ||
          error.code !== "storefront_not_found"
        ) {
          throw error;
        }
        // A storefront that was never materialized remotely has no hosted
        // checkout surface to deactivate.
      }
    }

    await storefrontService.delete(context, id);
    await logAudit(context, {
      action: "storefront.deleted",
      entity: "storefront",
      entityId: id,
      actor: trustedActorAuditIdentity(actorContext.actor),
      before: existing as unknown as Record<string, unknown> | null,
      metadata: { hostedPaused },
    });
    return NextResponse.json({ ok: true, hostedPaused });
  },
  "DELETE /api/storefront/config/[id]",
);
