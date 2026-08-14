import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import {
  finalizeActiveStorefrontPublish,
  type HostedPublishTransfer,
} from "@/lib/connected-platform/storefront-delegation";
import {
  materializeRollbackPreparedPublish,
  prepareStorefrontRollback,
  rollbackRequestedAllocations,
  type HostedRollbackResult,
  type RollbackCatalogItem,
} from "@/lib/connected-platform/storefront-rollback";
import { loadStorefrontRuntime } from "@/lib/connected-platform/runtime";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { storefrontService } from "@/lib/storefront/service";
import { ConflictError, NotFoundError } from "@/types/errors";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

const rollbackSchema = z.object({
  sourceReleaseId: z.string().regex(ID),
  expectedActiveReleaseId: z.string().regex(ID),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

type ReleaseHistory = Readonly<{
  storefrontId: string;
  releases: readonly Readonly<{
    releaseId: string;
    parentReleaseId: string | null;
    templateId: "sahara" | "atlas" | "oasis";
    locale: "ar" | "fr" | "en";
    artifactDigest: string;
    createdAt: string;
    isActive: boolean;
    catalog: readonly RollbackCatalogItem[];
  }>[];
  activeAllocations: readonly Readonly<{
    itemKey: string;
    remainingQuantity: number;
  }>[];
}>;

function rollbackOperationKey(
  storefrontId: string,
  sourceReleaseId: string,
  expectedActiveReleaseId: string,
): string {
  return `storefront-rollback:${storefrontId}:${sourceReleaseId}:${expectedActiveReleaseId}`;
}

async function loadReleaseHistory(
  storefrontId: string,
  limit = 50,
): Promise<ReleaseHistory> {
  const context = { prisma: db, shop: shopContext };
  const runtime = await loadStorefrontRuntime(context);
  const history = await runtime.client.listStorefrontReleases(
    storefrontId,
    shopContext.workspaceId,
    limit,
  ) as unknown as ReleaseHistory;
  if (
    history.storefrontId !== storefrontId ||
    !Array.isArray(history.releases) ||
    !Array.isArray(history.activeAllocations)
  ) {
    throw new ConflictError("Hosted storefront release history is invalid");
  }
  return history;
}

/** GET — authenticated immutable hosted release history for the Studio. */
export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: RouteContext,
) => {
  await requireTrustedAction("storefront.read");
  const { id } = await params;
  const context = { prisma: db, shop: shopContext };
  if (!(await storefrontService.getById(context, id))) {
    throw new NotFoundError("Storefront", id);
  }
  const history = await loadReleaseHistory(id, 50);
  return NextResponse.json({ history }, { headers: { "Cache-Control": "no-store" } });
}, "GET /api/storefront/config/[id]/releases");

/**
 * POST — rollback to a historical immutable hosted release by publishing a new
 * child release with fresh desktop-delegated stock. Historical releases are
 * never reactivated in place.
 */
export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: RouteContext,
) => {
  const actorContext = await requireTrustedAction("storefront.publish");
  await requireRecentReauthentication();
  const { id } = await params;
  const input = rollbackSchema.parse(await request.json());
  if (input.sourceReleaseId === input.expectedActiveReleaseId) {
    throw new ConflictError("The active storefront release cannot roll back to itself");
  }

  const context = { prisma: db, shop: shopContext };
  const before = await storefrontService.getById(context, id);
  if (!before) throw new NotFoundError("Storefront", id);
  const runtime = await loadStorefrontRuntime(context);
  const history = await runtime.client.listStorefrontReleases(
    id,
    shopContext.workspaceId,
    100,
  ) as unknown as ReleaseHistory;
  const source = history.releases.find(
    (release) => release.releaseId === input.sourceReleaseId,
  );
  if (!source || source.catalog.length < 1) {
    throw new NotFoundError("Storefront release", input.sourceReleaseId);
  }

  const active = history.releases.find((release) => release.isActive);
  if (!active) {
    throw new ConflictError("Hosted storefront has no active release to roll back");
  }
  if (active.releaseId !== input.expectedActiveReleaseId) {
    // A timeout after cloud commit moves the hosted active release before local
    // finalization. Permit only a previously committed local prepare command to
    // cross this mismatch; a fresh stale request still fails closed.
    const operationKey = rollbackOperationKey(
      id,
      input.sourceReleaseId,
      input.expectedActiveReleaseId,
    );
    const prepared = await db.businessCommand.findFirst({
      where: {
        idempotencyKey: operationKey,
        status: "committed",
      },
      select: { id: true },
    });
    if (!prepared) {
      throw new ConflictError("The hosted storefront changed before rollback could start");
    }
  }

  const businessContext = {
    ...context,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };
  const preparedCommand = await prepareStorefrontRollback(businessContext, {
    storefrontId: id,
    sourceReleaseId: input.sourceReleaseId,
    expectedActiveReleaseId: input.expectedActiveReleaseId,
    catalog: source.catalog,
  });
  const prepared = preparedCommand.result;
  const allocations = rollbackRequestedAllocations(
    prepared,
    history.activeAllocations,
  );
  const rolled = await runtime.client.rollbackStorefrontRelease(id, {
    workspaceId: shopContext.workspaceId,
    sourceReleaseId: input.sourceReleaseId,
    releaseId: prepared.releaseId,
    expectedActiveReleaseId: input.expectedActiveReleaseId,
    allocations,
  }) as unknown as HostedRollbackResult & Readonly<{
    status: "rolled_back";
    replay: boolean;
  }>;
  if (rolled.status !== "rolled_back") {
    throw new ConflictError("Hosted storefront did not acknowledge rollback");
  }

  const current = await storefrontService.getById(context, id);
  if (!current) throw new NotFoundError("Storefront", id);
  const preparedPublish = materializeRollbackPreparedPublish(
    prepared,
    {
      ...rolled,
      parentReleaseId: rolled.previousReleaseId,
    },
    current,
  );
  const hostedTransfer: HostedPublishTransfer = Object.freeze({
    releaseId: rolled.releaseId,
    parentReleaseId: rolled.previousReleaseId,
    artifactDigest: rolled.artifactDigest,
    allocations: rolled.allocations,
    retiredAllocations: rolled.retiredAllocations,
  });
  const finalized = await finalizeActiveStorefrontPublish(
    businessContext,
    preparedPublish,
    hostedTransfer,
  );
  const after = await storefrontService.getById(context, id);
  if (!after) throw new NotFoundError("Storefront", id);

  await logAudit(context, {
    action: "storefront.rolled_back",
    entity: "storefront",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
    metadata: {
      sourceReleaseId: input.sourceReleaseId,
      previousReleaseId: input.expectedActiveReleaseId,
      releaseId: rolled.releaseId,
      prepareReplayed: preparedCommand.replayed,
      hostedReplayed: rolled.replay,
      finalizeReplayed: finalized.replayed,
    },
  });

  return NextResponse.json({
    config: after,
    rollback: {
      sourceReleaseId: input.sourceReleaseId,
      previousReleaseId: input.expectedActiveReleaseId,
      releaseId: rolled.releaseId,
      artifactDigest: rolled.artifactDigest,
      replayed: preparedCommand.replayed || rolled.replay || finalized.replayed,
    },
  });
}, "POST /api/storefront/config/[id]/releases");
