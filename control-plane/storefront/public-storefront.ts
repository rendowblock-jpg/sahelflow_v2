import { json } from "./shared";
import type {
  AllocationRow,
  ReleaseRow,
  StorefrontRow,
  StorefrontWorkerEnvironment,
} from "./types";

export async function publicStorefront(
  environment: StorefrontWorkerEnvironment,
  slug: string,
): Promise<Response> {
  const storefront = await environment.DB.prepare(
    `SELECT storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key,
            active_release_id, state
       FROM storefront WHERE slug = ?1`,
  )
    .bind(slug)
    .first<StorefrontRow>();
  if (!storefront || storefront.state !== "active" || !storefront.active_release_id) {
    return json({ error: "storefront_not_found" }, 404);
  }
  const release = await environment.DB.prepare(
    `SELECT release_id, storefront_id, parent_release_id, template_id, locale,
            artifact_json, artifact_digest
       FROM storefront_release
      WHERE release_id = ?1 AND storefront_id = ?2`,
  )
    .bind(storefront.active_release_id, storefront.storefront_id)
    .first<ReleaseRow>();
  if (!release) return json({ error: "release_unavailable" }, 503);

  const allocations = await environment.DB.prepare(
    `SELECT item_key, unit_price_dzd, remaining_quantity
       FROM storefront_allocation
      WHERE release_id = ?1
      ORDER BY item_key ASC`,
  )
    .bind(release.release_id)
    .all<AllocationRow>();

  return json({
    storefrontId: storefront.storefront_id,
    releaseId: release.release_id,
    templateId: release.template_id,
    locale: release.locale,
    artifactDigest: release.artifact_digest,
    publicArtifact: JSON.parse(release.artifact_json) as unknown,
    catalog: (allocations.results ?? []).map((row) => ({
      itemKey: row.item_key,
      unitPriceDzd: row.unit_price_dzd,
      available: row.remaining_quantity > 0,
    })),
    receiptEncryptionPublicKey: storefront.receipt_encryption_public_key,
  });
}
