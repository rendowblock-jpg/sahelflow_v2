import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { createStorefrontReleaseInput } from "@/lib/storefront/release-artifact";
import type { ConnectedPlatformClient } from "./client";
import type {
  HostedPauseTransfer,
  HostedPublishTransfer,
  PreparedStorefrontPublish,
} from "./storefront-delegation";
import type { StorefrontReceiptKeys } from "./runtime";

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
  );
  const preparedHistory = history.releases.find(
    (release) => release.releaseId === input.prepared.releaseId,
  );
  const parentReleaseId = preparedHistory?.parentReleaseId ??
    history.releases.find((release) => release.isActive)?.releaseId ?? null;
  const release = createStorefrontReleaseInput({
    workspaceId: shop.workspaceId,
    releaseId: input.prepared.releaseId,
    parentReleaseId,
    locale: input.prepared.locale,
    draft: input.prepared.draft,
    products: input.prepared.products,
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
  context: ServiceContext;
  prepared: PreparedStorefrontPublish;
}>): Promise<HostedPauseTransfer> {
  const shop = input.context.shop;
  if (!shop) throw new Error("Hosted storefront pause requires active shop authority");
  if (input.prepared.draft.isActive) {
    throw new Error("Active storefront drafts cannot use the hosted pause transition");
  }
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
