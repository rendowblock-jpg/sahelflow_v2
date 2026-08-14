import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand, type BusinessTransaction } from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandResult,
  InventoryMovementFact,
  OpenReservationFact,
} from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import type { StorefrontConfig } from "@/lib/storefront/service";
import type { StorefrontReleaseProduct } from "@/lib/storefront/release-artifact";
import { parseStorefrontReleaseItemKey } from "@/lib/storefront/release-artifact";
import { storefrontStudioDraftSchema, storefrontStudioThemeSchema } from "@/lib/storefront/studio-schema";
import { ConflictError, NotFoundError } from "@/types/errors";
import type {
  HostedPublishTransfer,
  PreparedStorefrontPublish,
} from "./storefront-delegation";

const PROVISIONAL_PREFIX = "storefront-provisional:";
const ITEM_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export type RollbackCatalogItem = Readonly<{
  itemKey: string;
  unitPriceDzd: number;
}>;

export type PreparedStorefrontRollback = Readonly<{
  storefrontId: string;
  sourceReleaseId: string;
  expectedActiveReleaseId: string;
  releaseId: string;
  catalog: readonly RollbackCatalogItem[];
  provisionalAllocations: readonly { itemKey: string; quantity: number }[];
  products: readonly StorefrontReleaseProduct[];
}>;

export type HostedRollbackResult = HostedPublishTransfer & Readonly<{
  sourceReleaseId: string;
  previousReleaseId: string;
  templateId: "sahara" | "atlas" | "oasis";
  locale: "ar" | "fr" | "en";
  publicArtifact: unknown;
  shippingRules: readonly {
    wilayaCode: string;
    deliveryMode: "home" | "desk";
    feeDzd: number;
  }[];
}>;

const catalogSchema = z.array(z.object({
  itemKey: z.string().regex(ITEM_KEY),
  unitPriceDzd: z.number().int().nonnegative(),
}).strict()).min(1).max(500);

const rollbackArtifactSchema = z.object({
  schemaVersion: z.literal(2),
  storeName: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  theme: z.record(z.string(), z.unknown()),
  products: z.array(z.object({
    itemKey: z.string().regex(ITEM_KEY),
    productId: z.string().regex(ID),
    variantId: z.string().regex(ID).nullable(),
  }).passthrough()).min(1).max(500),
}).passthrough();

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
    throw new ConflictError("Storefront rollback protected stock authority is invalid");
  }
  return quantity;
}

function provisionalReservationKey(releaseId: string, itemKey: string): string {
  return `${PROVISIONAL_PREFIX}${releaseId}:${itemKey}`;
}

export async function prepareStorefrontRollback(
  context: BusinessPrincipalContext,
  input: Readonly<{
    storefrontId: string;
    sourceReleaseId: string;
    expectedActiveReleaseId: string;
    catalog: readonly RollbackCatalogItem[];
  }>,
): Promise<BusinessCommandResult<PreparedStorefrontRollback>> {
  const catalog = catalogSchema.parse(input.catalog);
  const idempotencyKey = `storefront-rollback:${input.storefrontId}:${input.sourceReleaseId}:${input.expectedActiveReleaseId}`;
  return executeBusinessCommand(
    context,
    {
      idempotencyKey,
      commandType: "storefront.rollback.prepare.v1",
      aggregate: {
        type: "storefront-rollback-operation",
        id: idempotencyKey,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId: idempotencyKey,
      payload: { ...input, catalog },
    },
    async ({ tx, commandId }) => {
      const storefront = await tx.storefrontConfig.findUnique({
        where: { id: input.storefrontId },
        select: { id: true },
      });
      if (!storefront) throw new NotFoundError("Storefront", input.storefrontId);

      const releaseId = `storefront_release_${commandId.replaceAll("-", "")}`;
      const authorities = catalog.map((item) => {
        const parsed = parseStorefrontReleaseItemKey(item.itemKey);
        if (!parsed) throw new ConflictError(`Historical item '${item.itemKey}' is invalid`);
        return { ...item, ...parsed };
      });
      const productIds = [...new Set(authorities.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, isActive: true, deletedAt: null },
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
      if (products.length !== productIds.length) {
        throw new ConflictError("Historical storefront catalog contains an inactive or missing product");
      }
      const byProduct = new Map(products.map((product) => [product.id, product]));
      const reservations: OpenReservationFact[] = [];
      const movements: InventoryMovementFact[] = [];
      const provisionalAllocations: Array<{ itemKey: string; quantity: number }> = [];

      for (const item of authorities) {
        const product = byProduct.get(item.productId);
        if (!product) throw new ConflictError(`Historical product '${item.productId}' is unavailable`);
        let physicalStock: number;
        if (item.variantId) {
          const variant = product.productVariants.find(
            (candidate) => candidate.id === item.variantId && candidate.isActive,
          );
          if (!variant) {
            throw new ConflictError(`Historical variant '${item.variantId}' is inactive or missing`);
          }
          physicalStock = variant.stock;
        } else {
          if (product.productVariants.some((variant) => variant.isActive)) {
            throw new ConflictError(
              `Historical base item '${item.itemKey}' no longer matches the current variant catalog`,
            );
          }
          physicalStock = product.stock;
        }
        if (!Number.isSafeInteger(physicalStock) || physicalStock < 0) {
          throw new ConflictError("Storefront rollback physical stock authority is invalid");
        }
        const protectedStock = await protectedQuantity(tx, item.productId, item.variantId);
        if (protectedStock > physicalStock) {
          throw new ConflictError("Storefront rollback delegated stock exceeds physical stock");
        }
        const quantity = physicalStock - protectedStock;
        provisionalAllocations.push({ itemKey: item.itemKey, quantity });
        if (quantity === 0) continue;
        const reservationId = randomUUID();
        const reservationKey = provisionalReservationKey(releaseId, item.itemKey);
        reservations.push({
          operation: "open",
          id: reservationId,
          reservationKey,
          orderId: `storefront-provisional:${input.storefrontId}:${releaseId}`,
          productId: item.productId,
          productVariantId: item.variantId ?? undefined,
          quantity,
        });
        movements.push({
          movementKey: `${reservationKey}:open`,
          movementType: "storefront_rollback_provisional_hold",
          reservationId,
          productId: item.productId,
          productVariantId: item.variantId ?? undefined,
          quantity,
          fromPosition: "available",
          toPosition: "storefront_publish_provisional",
          reason: `Historical release ${input.sourceReleaseId} reserved locally available stock before rollback ${releaseId}`,
        });
      }

      const result: PreparedStorefrontRollback = Object.freeze({
        storefrontId: input.storefrontId,
        sourceReleaseId: input.sourceReleaseId,
        expectedActiveReleaseId: input.expectedActiveReleaseId,
        releaseId,
        catalog: Object.freeze(catalog.map((item) => Object.freeze({ ...item }))),
        provisionalAllocations: Object.freeze(
          provisionalAllocations.map((item) => Object.freeze({ ...item })),
        ),
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
      });
      return {
        result,
        audit: {
          action: "storefront.rollback.prepared.v1",
          entity: "storefront",
          entityId: input.storefrontId,
          after: {
            sourceReleaseId: input.sourceReleaseId,
            expectedActiveReleaseId: input.expectedActiveReleaseId,
            releaseId,
            provisionalReservationCount: reservations.length,
          },
        },
        events: [{
          key: `${commandId}:prepared`,
          type: "storefront.rollback.prepared.v1",
          payload: {
            storefrontId: input.storefrontId,
            sourceReleaseId: input.sourceReleaseId,
            releaseId,
          },
        }],
        reservations,
        inventoryMovements: movements,
        projectionInvalidations: ["storefronts:list", `storefronts:${input.storefrontId}`],
      };
    },
  );
}

export function rollbackRequestedAllocations(
  prepared: PreparedStorefrontRollback,
  activeAllocations: readonly { itemKey: string; remainingQuantity: number }[],
): Array<{ itemKey: string; unitPriceDzd: number; quantity: number }> {
  const parentRemaining = new Map(activeAllocations.map((item) => [item.itemKey, item.remainingQuantity]));
  const provisional = new Map(prepared.provisionalAllocations.map((item) => [item.itemKey, item.quantity]));
  return prepared.catalog.map((item) => {
    const quantity = (parentRemaining.get(item.itemKey) ?? 0) + (provisional.get(item.itemKey) ?? 0);
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new ConflictError(`Rollback allocation '${item.itemKey}' is invalid`);
    }
    return {
      itemKey: item.itemKey,
      unitPriceDzd: item.unitPriceDzd,
      quantity,
    };
  });
}

export function materializeRollbackPreparedPublish(
  prepared: PreparedStorefrontRollback,
  hosted: HostedRollbackResult,
  current: StorefrontConfig,
): PreparedStorefrontPublish {
  if (
    hosted.releaseId !== prepared.releaseId ||
    hosted.sourceReleaseId !== prepared.sourceReleaseId ||
    hosted.previousReleaseId !== prepared.expectedActiveReleaseId
  ) {
    throw new ConflictError("Hosted rollback result does not match the prepared rollback operation");
  }
  const artifact = rollbackArtifactSchema.parse(hosted.publicArtifact);
  const productIds = [...new Set(artifact.products.map((product) => product.productId))];
  const preparedIds = new Set(prepared.products.map((product) => product.id));
  if (productIds.some((productId) => !preparedIds.has(productId))) {
    throw new ConflictError("Hosted rollback artifact escaped the prepared local catalog authority");
  }
  const publicTheme = artifact.theme as Record<string, unknown>;
  const publicBuilder = publicTheme.builder;
  if (!publicBuilder || typeof publicBuilder !== "object" || Array.isArray(publicBuilder)) {
    throw new ConflictError("Historical storefront builder authority is invalid");
  }
  const theme = storefrontStudioThemeSchema.parse({
    ...publicTheme,
    builder: {
      ...(publicBuilder as Record<string, unknown>),
      domain: current.theme.builder.domain,
      shippingRules: hosted.shippingRules,
    },
  });
  const draft = storefrontStudioDraftSchema.parse({
    name: artifact.storeName,
    slug: current.slug,
    description: artifact.description ?? "",
    theme,
    selectedProductIds: productIds,
    isActive: true,
  });
  return Object.freeze({
    storefrontId: prepared.storefrontId,
    releaseId: prepared.releaseId,
    draftUpdatedAt: current.updatedAt.toISOString(),
    locale: hosted.locale,
    draft: Object.freeze(structuredClone(draft)),
    products: prepared.products,
  });
}
