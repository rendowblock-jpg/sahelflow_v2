import { ID, MAX_POLL_LIMIT, authorizeDesktop, json } from "./shared";
import type { StorefrontWorkerEnvironment } from "./types";

type ReleaseHistoryRow = {
  release_id: string;
  parent_release_id: string | null;
  template_id: "sahara" | "atlas" | "oasis";
  locale: "ar" | "fr" | "en";
  artifact_digest: string;
  created_at: string;
  is_active: number;
};

type ActiveAllocationRow = {
  item_key: string;
  remaining_quantity: number;
};

type ReleaseCatalogRow = {
  release_id: string;
  item_key: string;
  unit_price_dzd: number;
};

export async function listReleases(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  storefrontId: string,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
  if (
    !ID.test(workspaceId) ||
    !Number.isSafeInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > MAX_POLL_LIMIT
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!(await authorizeDesktop(request, environment, workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }

  const releases = await environment.DB.prepare(
    `SELECT r.release_id, r.parent_release_id, r.template_id, r.locale,
            r.artifact_digest, r.created_at,
            CASE WHEN s.active_release_id = r.release_id THEN 1 ELSE 0 END AS is_active
       FROM storefront_release r
       JOIN storefront s ON s.storefront_id = r.storefront_id
      WHERE r.storefront_id = ?1 AND s.workspace_id = ?2
      ORDER BY r.created_at DESC, r.release_id DESC
      LIMIT ?3`,
  )
    .bind(storefrontId, workspaceId, requestedLimit)
    .all<ReleaseHistoryRow>();
  if (!releases.success) return json({ error: "release_history_unavailable" }, 503);

  const activeReleaseId = (releases.results ?? []).find((release) => release.is_active === 1)?.release_id ?? null;
  const [activeAllocations, catalogRows] = await Promise.all([
    activeReleaseId
      ? environment.DB.prepare(
          `SELECT item_key, remaining_quantity
             FROM storefront_allocation
            WHERE release_id = ?1 AND remaining_quantity > 0
            ORDER BY item_key ASC`,
        ).bind(activeReleaseId).all<ActiveAllocationRow>()
      : Promise.resolve({ success: true, results: [] as ActiveAllocationRow[] }),
    environment.DB.prepare(
      `SELECT allocation.release_id, allocation.item_key, allocation.unit_price_dzd
         FROM storefront_allocation allocation
         JOIN storefront_release release ON release.release_id = allocation.release_id
         JOIN storefront store ON store.storefront_id = release.storefront_id
        WHERE release.storefront_id = ?1 AND store.workspace_id = ?2
          AND allocation.release_id IN (
            SELECT release_id
              FROM storefront_release
             WHERE storefront_id = ?1
             ORDER BY created_at DESC, release_id DESC
             LIMIT ?3
          )
        ORDER BY allocation.release_id ASC, allocation.item_key ASC`,
    ).bind(storefrontId, workspaceId, requestedLimit).all<ReleaseCatalogRow>(),
  ]);
  if (!activeAllocations.success || !catalogRows.success) {
    return json({ error: "release_allocation_unavailable" }, 503);
  }

  const catalogs = new Map<string, Array<{ itemKey: string; unitPriceDzd: number }>>();
  for (const row of catalogRows.results ?? []) {
    const rows = catalogs.get(row.release_id) ?? [];
    rows.push({ itemKey: row.item_key, unitPriceDzd: row.unit_price_dzd });
    catalogs.set(row.release_id, rows);
  }

  return json({
    storefrontId,
    releases: (releases.results ?? []).map((release) => ({
      releaseId: release.release_id,
      parentReleaseId: release.parent_release_id,
      templateId: release.template_id,
      locale: release.locale,
      artifactDigest: release.artifact_digest,
      createdAt: release.created_at,
      isActive: release.is_active === 1,
      catalog: catalogs.get(release.release_id) ?? [],
    })),
    activeAllocations: (activeAllocations.results ?? []).map((allocation) => ({
      itemKey: allocation.item_key,
      remainingQuantity: allocation.remaining_quantity,
    })),
  });
}
