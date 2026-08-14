import { parseReleaseInput } from "./release-input";
import { appendConservedAllocationStatements } from "./release-allocation";
import {
  appendAllocationRetirementSnapshot,
  loadAllocationTransferSnapshot,
} from "./release-transfer";
import { authorizeDesktop, canonicalJson, json, sha256Hex } from "./shared";
import type {
  D1Statement,
  StorefrontRow,
  StorefrontWorkerEnvironment,
} from "./types";

type ExistingReleaseRow = {
  release_id: string;
  parent_release_id: string | null;
  artifact_digest: string;
  request_digest: string | null;
};

async function publicationResponse(
  environment: StorefrontWorkerEnvironment,
  input: Readonly<{
    storefrontId: string;
    releaseId: string;
    parentReleaseId: string | null;
    artifactDigest: string;
    replay: boolean;
  }>,
): Promise<Response> {
  const snapshot = await loadAllocationTransferSnapshot(
    environment.DB,
    input.releaseId,
    input.releaseId,
  );
  return json(
    {
      storefrontId: input.storefrontId,
      releaseId: input.releaseId,
      parentReleaseId: input.parentReleaseId,
      artifactDigest: input.artifactDigest,
      allocations: snapshot.allocations,
      retiredAllocations: snapshot.retiredAllocations,
      status: "published",
      replay: input.replay,
    },
    input.replay ? 200 : 201,
  );
}

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
  const requestDigest = await sha256Hex(canonicalJson({
    storefrontId,
    workspaceId: input.workspaceId,
    releaseId: input.releaseId,
    templateId: input.templateId,
    locale: input.locale,
    artifactDigest,
    allocations: [...input.allocations].sort((left, right) => left.itemKey.localeCompare(right.itemKey)),
    shippingRules: [...input.shippingRules].sort((left, right) =>
      `${left.wilayaCode}:${left.deliveryMode}`.localeCompare(`${right.wilayaCode}:${right.deliveryMode}`)),
  }));

  const existing = await environment.DB.prepare(
    `SELECT release_id, parent_release_id, artifact_digest, request_digest
       FROM storefront_release
      WHERE release_id = ?1 AND storefront_id = ?2`,
  ).bind(input.releaseId, storefrontId).first<ExistingReleaseRow>();
  if (existing) {
    // Release IDs are generated from the durable desktop publish command. Once
    // committed, allocation/shipping inputs cannot mutate the immutable result;
    // a retry needs only prove it is replaying the same public artifact.
    if (existing.artifact_digest !== artifactDigest) {
      return json({ error: "release_idempotency_conflict" }, 409);
    }
    return publicationResponse(environment, {
      storefrontId,
      releaseId: input.releaseId,
      parentReleaseId: existing.parent_release_id,
      artifactDigest,
      replay: true,
    });
  }

  const statements: D1Statement[] = [
    environment.DB.prepare(
      `INSERT INTO storefront_release
        (release_id, storefront_id, parent_release_id, template_id, locale,
         artifact_json, artifact_digest, request_digest)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(
      input.releaseId,
      storefrontId,
      input.parentReleaseId,
      input.templateId,
      input.locale,
      artifactJson,
      artifactDigest,
      requestDigest,
    ),
  ];
  appendAllocationRetirementSnapshot(environment.DB, statements, {
    operationId: input.releaseId,
    storefrontId,
    sourceReleaseId: input.parentReleaseId,
    reason: "publish",
  });
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
    const raced = await environment.DB.prepare(
      `SELECT release_id, parent_release_id, artifact_digest, request_digest
         FROM storefront_release
        WHERE release_id = ?1 AND storefront_id = ?2`,
    ).bind(input.releaseId, storefrontId).first<ExistingReleaseRow>();
    if (raced?.artifact_digest === artifactDigest) {
      return publicationResponse(environment, {
        storefrontId,
        releaseId: input.releaseId,
        parentReleaseId: raced.parent_release_id,
        artifactDigest,
        replay: true,
      });
    }
    return json({ error: "release_conflict" }, 409);
  }
  return publicationResponse(environment, {
    storefrontId,
    releaseId: input.releaseId,
    parentReleaseId: input.parentReleaseId,
    artifactDigest,
    replay: false,
  });
}
