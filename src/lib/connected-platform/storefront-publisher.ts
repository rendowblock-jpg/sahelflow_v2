import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  createStorefrontReleaseInput,
  storefrontReleaseItemKey,
  type StorefrontReleaseProduct,
} from "@/lib/storefront/release-artifact";
import type { ConnectedPlatformClient } from "./client";
import type {
  HostedPauseTransfer,
  HostedPublishTransfer,
  PreparedStorefrontPublish,
} from "./storefront-delegation";
import type { StorefrontReceiptKeys } from "./runtime";

const PROVISIONAL_PREFIX = "storefront-provisional:";

type ReleaseHistoryWithAllocation = Awaited<
  ReturnType<ConnectedPlatformClient["listStorefrontReleases"]>
> & {
  activeAllocations?: Array<{ itemKey: string; remainingQuantity: number }>;
};

async function provisionalQuantityByItem(
  context: ServiceContext,
  releaseId: string,
): Promise<Map<string, number>> {
  const prefix = `${PROVISIONAL_PREFIX}${releaseId}:`;
  const rows = await context.prisma.$queryRaw<Array<{
    reservationKey: string;
    quantity: number | bigint;
  }>>`
    SELECT "reservationKey", "quantity"
      FROM "InventoryReservation"
     WHERE "reservationKey" LIKE ${`${prefix}%`}
       AND "state" = 'active'
     ORDER BY "reservationKey" ASC
  `;
  const quantities = new Map<string, number>();
  for (const row of rows) {
    if (!row.reservationKey.startsWith(prefix)) {
      throw new Error("Storefront provisional reservation scope is invalid");
    }
    const itemKey = row.reservationKey.slice(prefix.length);
    const quantity = Number(row.quantity);
    if (!itemKey || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error("Storefront provisional reservation quantity is invalid");
    }
    quantities.set(itemKey, quantity);
  }
  return quantities;
}

function requestedDelegationProducts(
  prepared: PreparedStorefrontPublish,
  provisional: ReadonlyMap<string, number>,
  parentRemaining: ReadonlyMap<string, number>,
): readonly StorefrontReleaseProduct[] {
  return Object.freeze(prepared.products.map((product) => {
    const activeVariants = product.productVariants?.filter((variant) => variant.isActive) ?? [];
    if (activeVariants.length > 0) {
      const productVariants = product.productVariants?.map((variant) => {
        if (!variant.isActive) return Object.freeze({ ...variant });
        const itemKey = storefrontReleaseItemKey(product.id, variant.id);
        const requested = (provisional.get(itemKey) ?? 0) + (parentRemaining.get(itemKey) ?? 0);
        if (!Number.isSafeInteger(requested) || requested < 0 || requested > variant.stock) {
          throw new Error(`Storefront delegation request exceeds physical variant stock for '${itemKey}'`);
        }
        return Object.freeze({ ...variant, stock: requested });
      }) ?? [];
      return Object.freeze({
        ...product,
        stock: productVariants
          .filter((variant) => variant.isActive)
          .reduce((sum, variant) => sum + variant.stock, 0),
        productVariants: Object.freeze(productVariants),
      });
    }
    const itemKey = storefrontReleaseItemKey(product.id, null);
    const requested = (provisional.get(itemKey) ?? 0) + (parentRemaining.get(itemKey) ?? 0);
    if (!Number.isSafeInteger(requested) || requested < 0 || requested > product.stock) {
      throw new Error(`Storefront delegation request exceeds physical product stock for '${itemKey}'`);
    }
    return Object.freeze({ ...product, stock: requested });
  }));
}

export async function publishHostedStorefront(input: Readonly<{
  client: ConnectedPlatformClient;
  receiptKeys: StorefrontReceiptKeys;
  context: ServiceContext;
  prepared: PreparedStorefrontPublish;
}>): Promise<HostedPublishTransfer> {
  const shop = input.context.shop;
  if (!shop) throw new Error("Hosted storefront publish requires active shop authority");
  if (!input.prepared.draft.isActive) {
    throw new Error("Inactive storefront drafts must use the hosted pause transition");
  }

  await input.client.createStorefront({
    workspaceId: shop.workspaceId,
    storefrontId: input.prepared.storefrontId,
    shopId: shop.shopId,
    slug: input.prepared.draft.slug,
    receiptEncryptionPublicKey: input.receiptKeys.publicKeyJwk,
  });
  const history = await input.client.listStorefrontReleases(
    input.prepared.storefrontId,
    shop.workspaceId,
    100,
  ) as ReleaseHistoryWithAllocation;
  const preparedHistory = history.releases.find(
    (release) => release.releaseId === input.prepared.releaseId,
  );
  const parentReleaseId = preparedHistory?.parentReleaseId ??
    history.releases.find((release) => release.isActive)?.releaseId ?? null;

  // A committed release is replayed by immutable release ID/artifact and does
  // not reinterpret stock. For a new release, request only the parent's current
  // unsold allocation plus stock protected by this operation's provisional
  // reservation. Older accepted hosted orders therefore remain excluded even
  // when an item was absent from an intermediate release.
  const products = preparedHistory
    ? input.prepared.products
    : requestedDelegationProducts(
        input.prepared,
        await provisionalQuantityByItem(input.context, input.prepared.releaseId),
        new Map((history.activeAllocations ?? []).map((allocation) => [
          allocation.itemKey,
          allocation.remainingQuantity,
        ])),
      );
  const release = createStorefrontReleaseInput({
    workspaceId: shop.workspaceId,
    releaseId: input.prepared.releaseId,
    parentReleaseId,
    locale: input.prepared.locale,
    draft: input.prepared.draft,
    products,
  });
  const published = await input.client.publishStorefrontRelease(
    input.prepared.storefrontId,
    release,
  );
  if (
    published.storefrontId !== input.prepared.storefrontId ||
    published.releaseId !== input.prepared.releaseId ||
    published.status !== "published"
  ) {
    throw new Error("Hosted storefront did not acknowledge the exact prepared release");
  }
  return Object.freeze({
    releaseId: published.releaseId,
    parentReleaseId,
    artifactDigest: published.artifactDigest,
    allocations: Object.freeze(published.allocations.map((allocation) => Object.freeze({ ...allocation }))),
    retiredAllocations: Object.freeze(
      published.retiredAllocations.map((allocation) => Object.freeze({ ...allocation })),
    ),
  });
}

export async function pauseHostedStorefront(input: Readonly<{
  client: ConnectedPlatformClient;
  receiptKeys: StorefrontReceiptKeys;
  context: ServiceContext;
  prepared: PreparedStorefrontPublish;
}>): Promise<HostedPauseTransfer> {
  const shop = input.context.shop;
  if (!shop) throw new Error("Hosted storefront pause requires active shop authority");
  if (input.prepared.draft.isActive) {
    throw new Error("Active storefront drafts cannot use the hosted pause transition");
  }
  // Creating is idempotent and gives even a never-published inactive draft a
  // durable remote object that can be explicitly paused rather than relying on
  // the absence of a release as deactivation semantics.
  await input.client.createStorefront({
    workspaceId: shop.workspaceId,
    storefrontId: input.prepared.storefrontId,
    shopId: shop.shopId,
    slug: input.prepared.draft.slug,
    receiptEncryptionPublicKey: input.receiptKeys.publicKeyJwk,
  });
  const paused = await input.client.pauseStorefront(input.prepared.storefrontId, {
    workspaceId: shop.workspaceId,
    operationId: `storefront_pause_${input.prepared.releaseId}`,
  });
  if (
    paused.storefrontId !== input.prepared.storefrontId ||
    paused.status !== "paused"
  ) {
    throw new Error("Hosted storefront did not acknowledge the prepared pause");
  }
  return Object.freeze({
    sourceReleaseId: paused.sourceReleaseId,
    retiredAllocations: Object.freeze(
      paused.retiredAllocations.map((allocation) => Object.freeze({ ...allocation })),
    ),
  });
}
