import { ID, authorizeDesktop, json, validRsaJwk } from "./shared";
import type { StorefrontWorkerEnvironment } from "./types";

export async function createStorefront(
  request: Request,
  environment: StorefrontWorkerEnvironment,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const input = body as {
    workspaceId?: unknown;
    storefrontId?: unknown;
    shopId?: unknown;
    slug?: unknown;
    receiptEncryptionPublicKey?: unknown;
  };
  const workspaceId = String(input.workspaceId ?? "");
  const storefrontId = String(input.storefrontId ?? "");
  const shopId = String(input.shopId ?? "");
  const slug = String(input.slug ?? "");
  if (
    !ID.test(workspaceId) ||
    !ID.test(storefrontId) ||
    !ID.test(shopId) ||
    !/^[a-z0-9][a-z0-9-]{2,62}$/.test(slug) ||
    !validRsaJwk(input.receiptEncryptionPublicKey)
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  const authority = await authorizeDesktop(request, environment, workspaceId);
  if (!authority) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    const result = await environment.DB.prepare(
      `INSERT INTO storefront
        (storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key)
       SELECT ?1, ?2, ?3, ?4, ?5
        WHERE (
          SELECT COUNT(*) FROM storefront WHERE workspace_id = ?2
        ) < ?6`,
    )
      .bind(
        storefrontId,
        workspaceId,
        shopId,
        slug,
        input.receiptEncryptionPublicKey,
        authority.shopSlots,
      )
      .run();
    if (!result.success) return json({ error: "storefront_unavailable" }, 503);
    if (result.meta?.changes !== 1) return json({ error: "storefront_limit_reached" }, 403);
  } catch {
    return json({ error: "storefront_conflict" }, 409);
  }
  return json({ storefrontId, status: "created" }, 201);
}
