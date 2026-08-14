import { parseReleaseInput } from "./release-input";
import { appendConservedAllocationStatements } from "./release-allocation";
import {
  appendAllocationRetirementSnapshot,
  loadAllocationTransferSnapshot,
} from "./release-transfer";
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

type ExistingRollbackRow = {
  release_id: string;
  artifact_digest: string;
  request_digest: string | null;
};

type ShippingRuleRow = {
  wilaya_code: string;
  delivery_mode: "home" | "desk";
  fee_dzd: number;
};

async function rollbackResponse(
  environment: StorefrontWorkerEnvironment,
  input: Readonly<{
    storefrontId: string;
    releaseId: string;
    sourceReleaseId: string;
    previousReleaseId: string;
    artifactDigest: string;
    replay: boolean;
  }>,
): Promise<Response> {
  const [snapshot, source, shipping] = await Promise.all([
    loadAllocationTransferSnapshot(environment.DB, input.releaseId, input.releaseId),
    environment.DB.prepare(
      `SELECT release_id, storefront_id, parent_release_id, template_id, locale,
              artifact_json, artifact_digest
         FROM storefront_release
        WHERE release_id = ?1 AND storefront_id = ?2`,
    ).bind(input.sourceReleaseId, input.storefrontId).first<ReleaseRow>(),
    environment.DB.prepare(
      `SELECT wilaya_code, delivery_mode, fee_dzd
         FROM storefront_shipping_rule
        WHERE release_id = ?1
        ORDER BY wilaya_code ASC, delivery_mode ASC`,
    ).bind(input.sourceReleaseId).all<ShippingRuleRow>(),
  ]);
  if (!source || !shipping.success || !shipping.results?.length) {
    return json({ error: "rollback_source_unavailable" }, 503);
  }
  let publicArtifact: unknown;
  try {
    publicArtifact = JSON.parse(source.artifact_json);
  } catch {
    return json({ error: "rollback_source_invalid" }, 409);
  }
  return json(
    {
      storefrontId: input.storefrontId,
      releaseId: input.releaseId,
      sourceReleaseId: input.sourceReleaseId,
      previousReleaseId: input.previousReleaseId,
      templateId: source.template_id,
      locale: source.locale,
      artifactDigest: input.artifactDigest,
      publicArtifact,
      shippingRules: shipping.results.map((rule) => ({
        wilayaCode: rule.wilaya_code,
        deliveryMode: rule.delivery_mode,
        feeDzd: rule.fee_dzd,
      })),
      allocations: snapshot.allocations,
      retiredAllocations: snapshot.retiredAllocations,
      status: "rolled_back",
      replay: input.replay,
    },
    input.replay ? 200 : 201,
  );
}

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
  const requestDigest = await sha256Hex(canonicalJson({
    storefrontId,
    workspaceId,
    sourceReleaseId,
    releaseId,
    expectedActiveReleaseId,
    artifactDigest,
    allocations: [...parsed.allocations].sort((left, right) => left.itemKey.localeCompare(right.itemKey)),
    shippingRules: [...parsed.shippingRules].sort((left, right) =>
      `${left.wilayaCode}:${left.deliveryMode}`.localeCompare(`${right.wilayaCode}:${right.deliveryMode}`)),
  }));

  const existing = await environment.DB.prepare(
    `SELECT release_id, artifact_digest, request_digest
       FROM storefront_release
      WHERE release_id = ?1 AND storefront_id = ?2`,
  ).bind(releaseId, storefrontId).first<ExistingRollbackRow>();
  if (existing) {
    // The desktop release ID is generated by one durable rollback command. Once
    // this immutable child exists, retry returns the committed transfer snapshot
    // instead of reinterpreting stock after the active release has moved.
    if (existing.artifact_digest !== artifactDigest) {
      return json({ error: "rollback_idempotency_conflict" }, 409);
    }
    return rollbackResponse(environment, {
      storefrontId,
      releaseId,
      sourceReleaseId,
      previousReleaseId: expectedActiveReleaseId,
      artifactDigest,
      replay: true,
    });
  }

  if (source.active_release_id !== expectedActiveReleaseId) {
    return json({ error: "rollback_conflict" }, 409);
  }

  const statements: D1Statement[] = [
    environment.DB.prepare(
      `INSERT INTO storefront_release
        (release_id, storefront_id, parent_release_id, template_id, locale,
         artifact_json, artifact_digest, request_digest)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(
      parsed.releaseId,
      storefrontId,
      parsed.parentReleaseId,
      parsed.templateId,
      parsed.locale,
      artifactJson,
      artifactDigest,
      requestDigest,
    ),
  ];
  appendAllocationRetirementSnapshot(environment.DB, statements, {
    operationId: parsed.releaseId,
    storefrontId,
    sourceReleaseId: parsed.parentReleaseId,
    reason: "rollback",
  });
  appendConservedAllocationStatements(
    environment.DB,
    statements,
    parsed.releaseId,
    parsed.parentReleaseId,
    parsed.allocations,
  );
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
    const raced = await environment.DB.prepare(
      `SELECT release_id, artifact_digest, request_digest
         FROM storefront_release
        WHERE release_id = ?1 AND storefront_id = ?2`,
    ).bind(releaseId, storefrontId).first<ExistingRollbackRow>();
    if (raced?.artifact_digest === artifactDigest) {
      return rollbackResponse(environment, {
        storefrontId,
        releaseId,
        sourceReleaseId,
        previousReleaseId: expectedActiveReleaseId,
        artifactDigest,
        replay: true,
      });
    }
    return json({ error: "rollback_conflict" }, 409);
  }

  return rollbackResponse(environment, {
    storefrontId,
    releaseId: parsed.releaseId,
    sourceReleaseId,
    previousReleaseId: expectedActiveReleaseId,
    artifactDigest,
    replay: false,
  });
}
