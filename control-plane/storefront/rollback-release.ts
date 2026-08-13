import { parseReleaseInput } from "./release-input";
import {
  ID,
  authorizeDesktop,
  canonicalJson,
  json,
  sha256Hex,
} from "./shared";
import type {
  D1Statement,
  ReleaseRow,
  StorefrontWorkerEnvironment,
} from "./types";

type RollbackSourceRow = ReleaseRow & { active_release_id: string | null };

type ShippingRuleRow = {
  wilaya_code: string;
  delivery_mode: "home" | "desk";
  fee_dzd: number;
};

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
  const input = body as {
    workspaceId?: unknown;
    sourceReleaseId?: unknown;
    releaseId?: unknown;
    expectedActiveReleaseId?: unknown;
    allocations?: unknown;
  };
  const workspaceId = String(input.workspaceId ?? "");
  const sourceReleaseId = String(input.sourceReleaseId ?? "");
  const releaseId = String(input.releaseId ?? "");
  const expectedActiveReleaseId = String(input.expectedActiveReleaseId ?? "");
  if (
    !ID.test(workspaceId) ||
    !ID.test(sourceReleaseId) ||
    !ID.test(releaseId) ||
    !ID.test(expectedActiveReleaseId) ||
    sourceReleaseId === expectedActiveReleaseId ||
    releaseId === sourceReleaseId ||
    releaseId === expectedActiveReleaseId ||
    !Array.isArray(input.allocations) ||
    input.allocations.length > 500
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!(await authorizeDesktop(request, environment, workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }

  const source = await environment.DB.prepare(
    `SELECT r.release_id, r.storefront_id, r.parent_release_id, r.template_id,
            r.locale, r.artifact_json, r.artifact_digest, s.active_release_id
       FROM storefront_release r
       JOIN storefront s ON s.storefront_id = r.storefront_id
      WHERE r.release_id = ?1 AND r.storefront_id = ?2 AND s.workspace_id = ?3`,
  )
    .bind(sourceReleaseId, storefrontId, workspaceId)
    .first<RollbackSourceRow>();
  if (!source) return json({ error: "release_not_found" }, 404);
  if (source.active_release_id !== expectedActiveReleaseId) {
    return json({ error: "rollback_conflict" }, 409);
  }

  const shipping = await environment.DB.prepare(
    `SELECT wilaya_code, delivery_mode, fee_dzd
       FROM storefront_shipping_rule
      WHERE release_id = ?1
      ORDER BY wilaya_code ASC, delivery_mode ASC`,
  )
    .bind(sourceReleaseId)
    .all<ShippingRuleRow>();
  if (!shipping.success || !shipping.results?.length) {
    return json({ error: "rollback_source_unavailable" }, 503);
  }

  let publicArtifact: unknown;
  try {
    publicArtifact = JSON.parse(source.artifact_json);
  } catch {
    return json({ error: "rollback_source_invalid" }, 409);
  }
  const parsed = parseReleaseInput({
    workspaceId,
    releaseId,
    parentReleaseId: expectedActiveReleaseId,
    templateId: source.template_id,
    locale: source.locale,
    publicArtifact,
    allocations: input.allocations,
    shippingRules: shipping.results.map((rule) => ({
      wilayaCode: rule.wilaya_code,
      deliveryMode: rule.delivery_mode,
      feeDzd: rule.fee_dzd,
    })),
  });
  if (!parsed) return json({ error: "invalid_rollback" }, 400);

  const artifactJson = canonicalJson(parsed.publicArtifact);
  const artifactDigest = await sha256Hex(artifactJson);
  if (artifactDigest !== source.artifact_digest) {
    return json({ error: "rollback_source_invalid" }, 409);
  }

  const statements: D1Statement[] = [
    environment.DB.prepare(
      `INSERT INTO storefront_release
        (release_id, storefront_id, parent_release_id, template_id, locale,
         artifact_json, artifact_digest)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(
      parsed.releaseId,
      storefrontId,
      parsed.parentReleaseId,
      parsed.templateId,
      parsed.locale,
      artifactJson,
      artifactDigest,
    ),
  ];
  for (const allocation of parsed.allocations) {
    statements.push(
      environment.DB.prepare(
        `INSERT INTO storefront_allocation
          (release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity)
         VALUES (?1, ?2, ?3, ?4, ?4)`,
      ).bind(
        parsed.releaseId,
        allocation.itemKey,
        allocation.unitPriceDzd,
        allocation.quantity,
      ),
    );
  }
  for (const rule of parsed.shippingRules) {
    statements.push(
      environment.DB.prepare(
        `INSERT INTO storefront_shipping_rule
          (release_id, wilaya_code, delivery_mode, fee_dzd)
         VALUES (?1, ?2, ?3, ?4)`,
      ).bind(parsed.releaseId, rule.wilayaCode, rule.deliveryMode, rule.feeDzd),
    );
  }

  try {
    const outcomes = await environment.DB.batch(statements);
    if (outcomes.some((outcome) => !outcome.success)) {
      return json({ error: "rollback_unavailable" }, 503);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("stale_release_parent")) {
      return json({ error: "rollback_conflict" }, 409);
    }
    return json({ error: "rollback_conflict" }, 409);
  }

  return json(
    {
      storefrontId,
      releaseId: parsed.releaseId,
      sourceReleaseId,
      previousReleaseId: expectedActiveReleaseId,
      artifactDigest,
      status: "rolled_back",
    },
    201,
  );
}
