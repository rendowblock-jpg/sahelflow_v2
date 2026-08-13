import "server-only";

import { randomUUID } from "node:crypto";
import type { ServiceContext } from "@/lib/data/service-base";
import type { StorefrontConfig } from "@/lib/storefront/service";
import { createStorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { createStorefrontReleaseInput } from "@/lib/storefront/release-artifact";
import type { ConnectedPlatformClient } from "./client";
import type { StorefrontReceiptKeys } from "./runtime";

function releaseId(): string {
  return `storefront_release_${randomUUID().replaceAll("-", "")}`;
}

export async function publishHostedStorefront(input: Readonly<{
  client: ConnectedPlatformClient;
  receiptKeys: StorefrontReceiptKeys;
  context: ServiceContext;
  config: StorefrontConfig;
  locale: "ar" | "fr" | "en";
}>): Promise<Readonly<{ releaseId: string; artifactDigest: string }>> {
  const shop = input.context.shop;
  if (!shop) throw new Error("Hosted storefront publish requires active shop authority");

  await input.client.createStorefront({
    workspaceId: shop.workspaceId,
    storefrontId: input.config.id,
    shopId: shop.shopId,
    slug: input.config.slug,
    receiptEncryptionPublicKey: input.receiptKeys.publicKeyJwk,
  });
  const history = await input.client.listStorefrontReleases(
    input.config.id,
    shop.workspaceId,
    100,
  );
  const parentReleaseId = history.releases.find((release) => release.isActive)?.releaseId ?? null;
  const products = await input.context.prisma.product.findMany({
    where: {
      id: { in: input.config.productIds },
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
  });
  const nextReleaseId = releaseId();
  const release = createStorefrontReleaseInput({
    workspaceId: shop.workspaceId,
    releaseId: nextReleaseId,
    parentReleaseId,
    locale: input.locale,
    draft: createStorefrontStudioDraft(input.config),
    products,
  });
  const published = await input.client.publishStorefrontRelease(input.config.id, release);
  if (published.releaseId !== nextReleaseId || published.status !== "published") {
    throw new Error("Hosted storefront did not acknowledge the exact release");
  }
  return Object.freeze({
    releaseId: published.releaseId,
    artifactDigest: published.artifactDigest,
  });
}
