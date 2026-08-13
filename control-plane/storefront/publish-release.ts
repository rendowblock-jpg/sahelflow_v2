import { parseReleaseInput } from "./release-input";
import { appendConservedAllocationStatements } from "./release-allocation";
import { authorizeDesktop, canonicalJson, json, sha256Hex } from "./shared";
import type {
  D1Statement,
  StorefrontRow,
  StorefrontWorkerEnvironment,
} from "./types";

export async function publishRelease(
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
  const input = parseReleaseInput(body);
  if (!input) return json({ error: "invalid_release" }, 400);
  if (!(await authorizeDesktop(request, environment, input.workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }
  const storefront = await environment.DB.prepare(
    `SELECT storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key,
            active_release_id, state
       FROM storefront
      WHERE storefront_id = ?1 AND workspace_id = ?2`,
  )
    .bind(storefrontId, input.workspaceId)
    .first<StorefrontRow>();
  if (!storefront) return json({ error: "storefront_not_found" }, 404);

  const artifactJson = canonicalJson(input.publicArtifact);
  const artifactDigest = await sha256Hex(artifactJson);
  const statements: D1Statement[] = [
    environment.DB.prepare(
      `INSERT INTO storefront_release
        (release_id, storefront_id, parent_release_id, template_id, locale,
         artifact_json, artifact_digest)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(
      input.releaseId,
      storefrontId,
      input.parentReleaseId,
      input.templateId,
      input.locale,
      artifactJson,
      artifactDigest,
    ),
  ];
  appendConservedAllocationStatements(
    environment.DB,
    statements,
    input.releaseId,
    input.parentReleaseId,
    input.allocations,
  );
  for (const rule of input.shippingRules) {
    statements.push(
      environment.DB.prepare(
        `INSERT INTO storefront_shipping_rule
          (release_id, wilaya_code, delivery_mode, fee_dzd)
         VALUES (?1, ?2, ?3, ?4)`,
      ).bind(input.releaseId, rule.wilayaCode, rule.deliveryMode, rule.feeDzd),
    );
  }
  try {
    const outcomes = await environment.DB.batch(statements);
    if (outcomes.some((outcome) => !outcome.success)) {
      return json({ error: "release_unavailable" }, 503);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("stale_release_parent")) {
      return json({ error: "stale_release_parent" }, 409);
    }
    return json({ error: "release_conflict" }, 409);
  }
  return json(
    {
      storefrontId,
      releaseId: input.releaseId,
      artifactDigest,
      status: "published",
    },
    201,
  );
}
