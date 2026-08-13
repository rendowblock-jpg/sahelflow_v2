import { ID, authorizeDesktop, json } from "./shared";
import type { StorefrontWorkerEnvironment } from "./types";

export async function rollbackRelease(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  storefrontId: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const input = body as { workspaceId?: unknown; releaseId?: unknown };
  const workspaceId = String(input.workspaceId ?? "");
  const releaseId = String(input.releaseId ?? "");
  if (!ID.test(workspaceId) || !ID.test(releaseId)) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!(await authorizeDesktop(request, environment, workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }
  const release = await environment.DB.prepare(
    `SELECT r.release_id
       FROM storefront_release r
       JOIN storefront s ON s.storefront_id = r.storefront_id
      WHERE r.release_id = ?1 AND r.storefront_id = ?2 AND s.workspace_id = ?3`,
  )
    .bind(releaseId, storefrontId, workspaceId)
    .first<{ release_id: string }>();
  if (!release) return json({ error: "release_not_found" }, 404);

  const result = await environment.DB.prepare(
    `UPDATE storefront
        SET active_release_id = ?1, updated_at = CURRENT_TIMESTAMP
      WHERE storefront_id = ?2 AND workspace_id = ?3`,
  )
    .bind(releaseId, storefrontId, workspaceId)
    .run();
  if (!result.success || result.meta?.changes === 0) {
    return json({ error: "rollback_conflict" }, 409);
  }
  return json({ storefrontId, releaseId, status: "rolled_back" });
}
