import "server-only";

import { randomUUID } from "node:crypto";

import {
  executeBusinessCommand,
  type BusinessTransaction,
} from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandResult,
  CloseReservationFact,
  InventoryMovementFact,
  OpenReservationFact,
} from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import type { StorefrontAllocationTransfer } from "./client";
import type { StorefrontReleaseProduct } from "@/lib/storefront/release-artifact";
import { storefrontReleaseItemKey } from "@/lib/storefront/release-artifact";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { storefrontStudioDraftSchema } from "@/lib/storefront/studio-schema";
import { StorefrontVersionConflictError } from "@/lib/storefront/service";
import { ConflictError, NotFoundError } from "@/types/errors";

const DELEGATION_PREFIX = "storefront-delegation:";
const PROVISIONAL_PREFIX = "storefront-provisional:";

export type PreparedStorefrontPublish = Readonly<{
  storefrontId: string;
  releaseId: string;
  draftUpdatedAt: string;
  locale: "ar" | "fr" | "en";
  draft: StorefrontStudioDraft;
  products: readonly StorefrontReleaseProduct[];
}>;

export type HostedPublishTransfer = Readonly<{
  releaseId: string;
  parentReleaseId: string | null;
  artifactDigest: string;
  allocations: readonly StorefrontAllocationTransfer[];
  retiredAllocations: readonly StorefrontAllocationTransfer[];
}>;

export type HostedPauseTransfer = Readonly<{
  sourceReleaseId: string | null;
  retiredAllocations: readonly StorefrontAllocationTransfer[];
}>;

type ReservationRow = {
  id: string;
  quantity: number | bigint;
  productId: string;
  productVariantId: string | null;
};

function provisionalReservationKey(releaseId: string, itemKey: string): string {
  return `${PROVISIONAL_PREFIX}${releaseId}:${itemKey}`;
}

export function storefrontDelegationReservationKey(
  releaseId: string,
  itemKey: string,
): string {
  return `${DELEGATION_PREFIX}${releaseId}:${itemKey}`;
}

function syntheticOrderId(kind: "provisional" | "delegation", storefrontId: string, releaseId: string): string {
  return `storefront-${kind}:${storefrontId}:${releaseId}`;
}

async function protectedQuantity(
  tx: BusinessTransaction,
  productId: string,
  productVariantId: string | null,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ quantity: number | bigint }>>`
    SELECT COALESCE(SUM("quantity"), 0) AS "quantity"
      FROM "InventoryReservation"
     WHERE "productId" = ${productId}
       AND (
         ("productVariantId" IS NULL AND ${productVariantId} IS NULL)
         OR "productVariantId" = ${productVariantId}
       )
       AND "state" = 'active'
       AND (
         "reservationKey" LIKE 'storefront-delegation:%'
         OR "reservationKey" LIKE 'storefront-provisional:%'
       )
  `;
  const quantity = Number(rows[0]?.quantity ?? 0);
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new ConflictError("Storefront protected stock authority is invalid");
  }
  return quantity;
}

async function snapshotProductsAndProvisionalReservations(
  tx: BusinessTransaction,
  storefrontId: string,
  releaseId: string,
  draft: StorefrontStudioDraft,
): Promise<Readonly<{
  products: readonly StorefrontReleaseProduct[];
  reservations: readonly OpenReservationFact[];
  movements: readonly InventoryMovementFact[];
}>> {
  const products = await tx.product.findMany({
    where: {
      id: { in: draft.selectedProductIds },
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      images: true,
      price: true,
      stock: true,
      productVariants: {
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          isActive: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
  if (products.length !== new Set(draft.selectedProductIds).size) {
    throw new ConflictError("Storefront draft references inactive or missing catalog authority");
  }

  const reservations: OpenReservationFact[] = [];
  const movements: InventoryMovementFact[] = [];
  if (draft.isActive) {
    for (const product of products) {
      const activeVariants = product.productVariants.filter((variant) => variant.isActive);
      const saleItems = activeVariants.length > 0
        ? activeVariants.map((variant) => ({
            itemKey: storefrontReleaseItemKey(product.id, variant.id),
            productId: product.id,
            productVariantId: variant.id as string | null,
            stock: variant.stock,
          }))
        : [{
            itemKey: storefrontReleaseItemKey(product.id, null),
            productId: product.id,
            productVariantId: null,
            stock: product.stock,
          }];
      for (const item of saleItems) {
        if (!Number.isSafeInteger(item.stock) || item.stock < 0) {
          throw new ConflictError("Storefront physical stock authority is invalid");
        }
        const alreadyProtected = await protectedQuantity(
          tx,
          item.productId,
          item.productVariantId,
        );
        if (alreadyProtected > item.stock) {
          throw new ConflictError("Storefront delegated stock exceeds physical stock authority");
        }
        const quantity = item.stock - alreadyProtected;
        if (quantity === 0) continue;
        const id = randomUUID();
        const reservationKey = provisionalReservationKey(releaseId, item.itemKey);
        reservations.push({
          operation: "open",
          id,
          reservationKey,
          orderId: syntheticOrderId("provisional", storefrontId, releaseId),
          productId: item.productId,
          productVariantId: item.productVariantId ?? undefined,
          quantity,
        });
        movements.push({
          movementKey: `${reservationKey}:open`,
          movementType: "storefront_publish_provisional_hold",
          reservationId: id,
          productId: item.productId,
          productVariantId: item.productVariantId ?? undefined,
          quantity,
          fromPosition: "available",
          toPosition: "storefront_publish_provisional",
          reason: `Storefront ${storefrontId} reserved locally available stock before hosted release ${releaseId}`,
        });
      }
    }
  }

  return Object.freeze({
    products: Object.freeze(products.map((product) => Object.freeze({
      id: product.id,
      name: product.name,
      sku: product.sku,
      images: product.images,
      price: product.price,
      stock: product.stock,
      productVariants: Object.freeze(product.productVariants.map((variant) => Object.freeze({
        id: variant.id,
        name: variant.name,
        price: variant.price,
        stock: variant.stock,
        isActive: variant.isActive,
      }))),
    }))),
    reservations: Object.freeze(reservations),
    movements: Object.freeze(movements),
  });
}

export async function prepareStorefrontPublish(
  context: BusinessPrincipalContext,
  input: Readonly<{
    storefrontId: string;
    expectedDraftUpdatedAt: string;
    locale: "ar" | "fr" | "en";
  }>,
): Promise<BusinessCommandResult<PreparedStorefrontPublish>> {
  const idempotencyKey = `storefront-publish:${input.storefrontId}:${input.expectedDraftUpdatedAt}:${input.locale}`;
  return executeBusinessCommand(
    context,
    {
      idempotencyKey,
      commandType: "storefront.publish.prepare.v1",
      aggregate: {
        type: "storefront-publish-operation",
        id: idempotencyKey,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId: idempotencyKey,
      payload: input,
    },
    async ({ tx, commandId }) => {
      const row = await tx.storefrontConfig.findUnique({ where: { id: input.storefrontId } });
      if (!row) throw new NotFoundError("Storefront", input.storefrontId);
      if (
        !row.draftUpdatedAt ||
        row.draftUpdatedAt.toISOString() !== input.expectedDraftUpdatedAt
      ) {
        throw new StorefrontVersionConflictError();
      }
      const draft = storefrontStudioDraftSchema.parse({
        name: row.draftName ?? row.name,
        slug: row.draftSlug ?? row.slug,
        description: row.draftDescription ?? "",
        theme: JSON.parse(row.draftTheme ?? row.theme) as unknown,
        selectedProductIds: JSON.parse(row.draftProductIds ?? row.productIds) as unknown,
        isActive: row.draftIsActive ?? row.isActive,
      });
      const slugConflict = await tx.storefrontConfig.findFirst({
        where: { slug: draft.slug, id: { not: row.id } },
        select: { id: true },
      });
      if (slugConflict) {
        throw new ConflictError(`Storefront slug '${draft.slug}' is already live`);
      }
      const releaseId = `storefront_release_${commandId.replaceAll("-", "")}`;
      const snapshot = await snapshotProductsAndProvisionalReservations(
        tx,
        row.id,
        releaseId,
        draft,
      );
      const result: PreparedStorefrontPublish = Object.freeze({
        storefrontId: row.id,
        releaseId,
        draftUpdatedAt: input.expectedDraftUpdatedAt,
        locale: input.locale,
        draft: Object.freeze(structuredClone(draft)),
        products: snapshot.products,
      });
      return {
        result,
        audit: {
          action: "storefront.publish.prepared.v1",
          entity: "storefront",
          entityId: row.id,
          before: { liveUpdatedAt: row.updatedAt.toISOString() },
          after: {
            releaseId,
            draftUpdatedAt: input.expectedDraftUpdatedAt,
            active: draft.isActive,
            provisionalReservationCount: snapshot.reservations.length,
          },
        },
        events: [{
          key: `${commandId}:prepared`,
          type: "storefront.publish.prepared.v1",
          payload: {
            storefrontId: row.id,
            releaseId,
            active: draft.isActive,
          },
        }],
        reservations: snapshot.reservations,
        inventoryMovements: snapshot.movements,
        projectionInvalidations: ["storefronts:list", `storefronts:${row.id}`],
      };
    },
  );
}

async function activeReservationByKey(
  tx: BusinessTransaction,
  reservationKey: string,
): Promise<ReservationRow | null> {
  const rows = await tx.$queryRaw<ReservationRow[]>`
    SELECT "id", "quantity", "productId", "productVariantId"
      FROM "InventoryReservation"
     WHERE "reservationKey" = ${reservationKey}
       AND "state" = 'active'
     LIMIT 1
  `;
  return rows[0] ?? null;
}

async function reduceActiveReservation(
  tx: BusinessTransaction,
  commandId: string,
  reservationKey: string,
  quantity: number,
): Promise<Readonly<{ row: ReservationRow; remaining: number }>> {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new ConflictError("Storefront retirement quantity is invalid");
  }
  const row = await activeReservationByKey(tx, reservationKey);
  if (!row) {
    throw new ConflictError(`Storefront reservation '${reservationKey}' is missing`);
  }
  const current = Number(row.quantity);
  if (!Number.isSafeInteger(current) || current < quantity) {
    throw new ConflictError(`Storefront reservation '${reservationKey}' is insufficient`);
  }
  const remaining = current - quantity;
  const updated = remaining === 0
    ? await tx.$executeRaw`
        UPDATE "InventoryReservation"
           SET "state" = 'released',
               "closedByCommandId" = ${commandId},
               "closedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ${row.id}
           AND "state" = 'active'
           AND "quantity" = ${current}
      `
    : await tx.$executeRaw`
        UPDATE "InventoryReservation"
           SET "quantity" = ${remaining}
         WHERE "id" = ${row.id}
           AND "state" = 'active'
           AND "quantity" = ${current}
      `;
  if (updated !== 1) {
    throw new ConflictError(`Storefront reservation '${reservationKey}' changed concurrently`);
  }
  return Object.freeze({ row, remaining });
}

async function provisionalClosures(
  tx: BusinessTransaction,
  releaseId: string,
): Promise<CloseReservationFact[]> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
      FROM "InventoryReservation"
     WHERE "reservationKey" LIKE ${`${PROVISIONAL_PREFIX}${releaseId}:%`}
       AND "state" = 'active'
     ORDER BY "reservationKey" ASC
  `;
  return rows.map((row) => ({ operation: "release", id: row.id }));
}

function allocationAuthority(
  prepared: PreparedStorefrontPublish,
  allocation: StorefrontAllocationTransfer,
): Readonly<{ productId: string; productVariantId: string | null }> {
  const productId = allocation.itemKey.split(":", 1)[0] ?? "";
  const product = prepared.products.find((candidate) => candidate.id === productId);
  if (!product) throw new ConflictError(`Hosted allocation '${allocation.itemKey}' is outside the prepared catalog`);
  const suffix = allocation.itemKey.slice(product.id.length + 1);
  if (suffix === "base") {
    if (product.productVariants?.some((variant) => variant.isActive)) {
      throw new ConflictError(`Hosted base allocation '${allocation.itemKey}' conflicts with prepared variants`);
    }
    return Object.freeze({ productId: product.id, productVariantId: null });
  }
  const variant = product.productVariants?.find((candidate) => candidate.id === suffix && candidate.isActive);
  if (!variant) throw new ConflictError(`Hosted variant allocation '${allocation.itemKey}' is outside the prepared catalog`);
  return Object.freeze({ productId: product.id, productVariantId: variant.id });
}

function publishedLegacyContact(draft: StorefrontStudioDraft): string | null {
  const contact = draft.theme.builder.contact;
  const hasAny = Boolean(
    contact.phone.trim() ||
    contact.whatsapp.trim() ||
    contact.email.trim() ||
    contact.address.trim(),
  );
  return hasAny ? JSON.stringify(contact) : null;
}

async function promotePreparedDraft(
  tx: BusinessTransaction,
  prepared: PreparedStorefrontPublish,
): Promise<void> {
  const result = await tx.storefrontConfig.updateMany({
    where: { id: prepared.storefrontId },
    data: {
      slug: prepared.draft.slug,
      name: prepared.draft.name,
      description: prepared.draft.description || null,
      theme: JSON.stringify(prepared.draft.theme),
      productIds: JSON.stringify(prepared.draft.selectedProductIds),
      // The durable finalize transaction is the real publication boundary.
      // Keep the legacy sibling projection synchronized here so V2 contact
      // edits and explicit clears cannot diverge from local public fallback.
      contact: publishedLegacyContact(prepared.draft),
      isActive: prepared.draft.isActive,
    },
  });
  if (result.count !== 1) throw new NotFoundError("Storefront", prepared.storefrontId);
}

export async function finalizeActiveStorefrontPublish(
  context: BusinessPrincipalContext,
  prepared: PreparedStorefrontPublish,
  hosted: HostedPublishTransfer,
): Promise<BusinessCommandResult<Readonly<{ releaseId: string; artifactDigest: string }>>> {
  if (!prepared.draft.isActive || hosted.releaseId !== prepared.releaseId) {
    throw new ConflictError("Hosted release does not match the prepared active storefront publish");
  }
  return executeBusinessCommand(
    context,
    {
      idempotencyKey: `storefront-publish-finalize:${prepared.releaseId}`,
      commandType: "storefront.publish.finalize.v1",
      aggregate: {
        type: "storefront-publish-finalize",
        id: prepared.releaseId,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId: `storefront-publish:${prepared.releaseId}`,
      payload: { prepared, hosted },
    },
    async ({ tx, commandId }) => {
      const reservations: Array<CloseReservationFact | OpenReservationFact> = [
        ...await provisionalClosures(tx, prepared.releaseId),
      ];
      const movements: InventoryMovementFact[] = [];

      if (hosted.parentReleaseId) {
        for (const retired of hosted.retiredAllocations) {
          if (retired.quantity <= 0) continue;
          const reduced = await reduceActiveReservation(
            tx,
            commandId,
            storefrontDelegationReservationKey(hosted.parentReleaseId, retired.itemKey),
            retired.quantity,
          );
          movements.push({
            movementKey: `${commandId}:retire:${retired.itemKey}`,
            movementType: "storefront_delegation_retired",
            reservationId: reduced.row.id,
            productId: reduced.row.productId,
            productVariantId: reduced.row.productVariantId ?? undefined,
            quantity: retired.quantity,
            fromPosition: "storefront_delegated",
            toPosition: "available",
            reason: `Hosted release ${hosted.parentReleaseId} retired unsold allocation during publish ${prepared.releaseId}`,
          });
        }
      } else if (hosted.retiredAllocations.some((allocation) => allocation.quantity > 0)) {
        throw new ConflictError("Hosted first release unexpectedly retired prior allocation");
      }

      for (const allocation of hosted.allocations) {
        if (!Number.isSafeInteger(allocation.quantity) || allocation.quantity < 0) {
          throw new ConflictError("Hosted delegated allocation is invalid");
        }
        if (allocation.quantity === 0) continue;
        const authority = allocationAuthority(prepared, allocation);
        const id = randomUUID();
        const reservationKey = storefrontDelegationReservationKey(
          prepared.releaseId,
          allocation.itemKey,
        );
        reservations.push({
          operation: "open",
          id,
          reservationKey,
          orderId: syntheticOrderId("delegation", prepared.storefrontId, prepared.releaseId),
          productId: authority.productId,
          productVariantId: authority.productVariantId ?? undefined,
          quantity: allocation.quantity,
        });
        movements.push({
          movementKey: `${reservationKey}:open`,
          movementType: "storefront_delegation_opened",
          reservationId: id,
          productId: authority.productId,
          productVariantId: authority.productVariantId ?? undefined,
          quantity: allocation.quantity,
          fromPosition: "storefront_publish_provisional",
          toPosition: "storefront_delegated",
          reason: `Hosted release ${prepared.releaseId} acknowledged exact delegated sellable stock`,
        });
      }
      await promotePreparedDraft(tx, prepared);
      const result = Object.freeze({
        releaseId: hosted.releaseId,
        artifactDigest: hosted.artifactDigest,
      });
      return {
        result,
        audit: {
          action: "storefront.published.v1",
          entity: "storefront",
          entityId: prepared.storefrontId,
          after: {
            releaseId: hosted.releaseId,
            artifactDigest: hosted.artifactDigest,
            delegatedItems: hosted.allocations.filter((allocation) => allocation.quantity > 0).length,
            retiredItems: hosted.retiredAllocations.filter((allocation) => allocation.quantity > 0).length,
          },
        },
        events: [{
          key: `${commandId}:published`,
          type: "storefront.published.v1",
          payload: {
            storefrontId: prepared.storefrontId,
            releaseId: hosted.releaseId,
            artifactDigest: hosted.artifactDigest,
          },
        }],
        reservations,
        inventoryMovements: movements,
        projectionInvalidations: ["storefronts:list", `storefronts:${prepared.storefrontId}`, "products:list"],
      };
    },
  );
}

export async function finalizePausedStorefrontPublish(
  context: BusinessPrincipalContext,
  prepared: PreparedStorefrontPublish,
  hosted: HostedPauseTransfer,
): Promise<BusinessCommandResult<Readonly<{ status: "paused" }>>> {
  if (prepared.draft.isActive) {
    throw new ConflictError("Active storefront publish cannot finalize a hosted pause");
  }
  return executeBusinessCommand(
    context,
    {
      idempotencyKey: `storefront-pause-finalize:${prepared.releaseId}`,
      commandType: "storefront.pause.finalize.v1",
      aggregate: {
        type: "storefront-pause-finalize",
        id: prepared.releaseId,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId: `storefront-publish:${prepared.releaseId}`,
      payload: { prepared, hosted },
    },
    async ({ tx, commandId }) => {
      const movements: InventoryMovementFact[] = [];
      if (hosted.sourceReleaseId) {
        for (const retired of hosted.retiredAllocations) {
          if (retired.quantity <= 0) continue;
          const reduced = await reduceActiveReservation(
            tx,
            commandId,
            storefrontDelegationReservationKey(hosted.sourceReleaseId, retired.itemKey),
            retired.quantity,
          );
          movements.push({
            movementKey: `${commandId}:pause:${retired.itemKey}`,
            movementType: "storefront_delegation_paused",
            reservationId: reduced.row.id,
            productId: reduced.row.productId,
            productVariantId: reduced.row.productVariantId ?? undefined,
            quantity: retired.quantity,
            fromPosition: "storefront_delegated",
            toPosition: "available",
            reason: `Hosted storefront ${prepared.storefrontId} paused unsold allocation from release ${hosted.sourceReleaseId}`,
          });
        }
      }
      await promotePreparedDraft(tx, prepared);
      const result = Object.freeze({ status: "paused" as const });
      return {
        result,
        audit: {
          action: "storefront.paused.v1",
          entity: "storefront",
          entityId: prepared.storefrontId,
          after: { sourceReleaseId: hosted.sourceReleaseId },
        },
        events: [{
          key: `${commandId}:paused`,
          type: "storefront.paused.v1",
          payload: { storefrontId: prepared.storefrontId, sourceReleaseId: hosted.sourceReleaseId },
        }],
        reservations: await provisionalClosures(tx, prepared.releaseId),
        inventoryMovements: movements,
        projectionInvalidations: ["storefronts:list", `storefronts:${prepared.storefrontId}`, "products:list"],
      };
    },
  );
}

export async function applyHostedPauseRetirement(
  context: ServiceContext,
  input: Readonly<{
    storefrontId: string;
    operationId: string;
    transfer: HostedPauseTransfer;
  }>,
): Promise<void> {
  await context.prisma.$transaction(async (tx) => {
    if (!input.transfer.sourceReleaseId) return;
    for (const retired of input.transfer.retiredAllocations) {
      if (retired.quantity <= 0) continue;
      const key = storefrontDelegationReservationKey(
        input.transfer.sourceReleaseId,
        retired.itemKey,
      );
      const row = await activeReservationByKey(tx as unknown as BusinessTransaction, key);
      if (!row) continue;
      const current = Number(row.quantity);
      if (!Number.isSafeInteger(current) || current < retired.quantity) {
        throw new ConflictError(`Storefront retirement '${key}' exceeds local delegation`);
      }
      const remaining = current - retired.quantity;
      const updated = remaining === 0
        ? await tx.$executeRaw`
            UPDATE "InventoryReservation"
               SET "state" = 'released', "closedAt" = CURRENT_TIMESTAMP
             WHERE "id" = ${row.id} AND "state" = 'active' AND "quantity" = ${current}
          `
        : await tx.$executeRaw`
            UPDATE "InventoryReservation"
               SET "quantity" = ${remaining}
             WHERE "id" = ${row.id} AND "state" = 'active' AND "quantity" = ${current}
          `;
      if (updated !== 1) throw new ConflictError(`Storefront retirement '${key}' changed concurrently`);
    }
  });
}

export async function consumeStorefrontDelegation(
  tx: BusinessTransaction,
  commandId: string,
  input: Readonly<{
    releaseId: string;
    items: readonly {
      productId: string;
      productVariantId: string | null;
      quantity: number;
    }[];
    outcome: "confirmed" | "rejected";
  }>,
): Promise<InventoryMovementFact[]> {
  const movements: InventoryMovementFact[] = [];
  for (const item of input.items) {
    const itemKey = storefrontReleaseItemKey(item.productId, item.productVariantId);
    const reduced = await reduceActiveReservation(
      tx,
      commandId,
      storefrontDelegationReservationKey(input.releaseId, itemKey),
      item.quantity,
    );
    movements.push({
      movementKey: `${commandId}:storefront:${itemKey}`,
      movementType: input.outcome === "confirmed"
        ? "storefront_delegation_consumed"
        : "storefront_delegation_released",
      reservationId: reduced.row.id,
      productId: item.productId,
      productVariantId: item.productVariantId ?? undefined,
      quantity: item.quantity,
      fromPosition: "storefront_delegated",
      toPosition: input.outcome === "confirmed" ? "order_reserved" : "available",
      reason: input.outcome === "confirmed"
        ? `Hosted storefront release ${input.releaseId} converted delegated stock into canonical order stock`
        : `Hosted storefront release ${input.releaseId} released delegated stock after seller rejection`,
    });
  }
  return movements;
}