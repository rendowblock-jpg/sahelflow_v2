import { ID, authorizeDesktop, json } from "./shared";
import {
  appendAllocationRetirementSnapshot,
  loadAllocationTransferSnapshot,
} from "./release-transfer";
import type {
  D1Statement,
  StorefrontRow,
  StorefrontWorkerEnvironment,
} from "./types";

type PauseOperationRow = {
  operation_id: string;
  storefront_id: string;
  workspace_id: string;
  source_release_id: string | null;
};

async function pauseResponse(
  environment: StorefrontWorkerEnvironment,
  operation: PauseOperationRow,
): Promise<Response> {
  const snapshot = await loadAllocationTransferSnapshot(
    environment.DB,
    operation.operation_id,
    null,
  );
  return json({
    storefrontId: operation.storefront_id,
    operationId: operation.operation_id,
    sourceReleaseId: operation.source_release_id,
    retiredAllocations: snapshot.retiredAllocations,
    status: "paused",
  });
}

export async function pauseStorefront(
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
  const input = body as { workspaceId?: unknown; operationId?: unknown };
  const workspaceId = String(input.workspaceId ?? "");
  const operationId = String(input.operationId ?? "");
  if (!ID.test(workspaceId) || !ID.test(operationId)) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!(await authorizeDesktop(request, environment, workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }

  const existingOperation = await environment.DB.prepare(
    `SELECT operation_id, storefront_id, workspace_id, source_release_id
       FROM storefront_pause_operation
      WHERE operation_id = ?1`,
  ).bind(operationId).first<PauseOperationRow>();
  if (existingOperation) {
    if (
      existingOperation.storefront_id !== storefrontId ||
      existingOperation.workspace_id !== workspaceId
    ) {
      return json({ error: "pause_idempotency_conflict" }, 409);
    }
    return pauseResponse(environment, existingOperation);
  }

  const storefront = await environment.DB.prepare(
    `SELECT storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key,
            active_release_id, state
       FROM storefront
      WHERE storefront_id = ?1 AND workspace_id = ?2`,
  ).bind(storefrontId, workspaceId).first<StorefrontRow>();
  if (!storefront) return json({ error: "storefront_not_found" }, 404);

  const statements: D1Statement[] = [
    environment.DB.prepare(
      `INSERT INTO storefront_pause_operation
        (operation_id, storefront_id, workspace_id, source_release_id)
       VALUES (?1, ?2, ?3, ?4)`,
    ).bind(operationId, storefrontId, workspaceId, storefront.active_release_id),
  ];
  appendAllocationRetirementSnapshot(environment.DB, statements, {
    operationId,
    storefrontId,
    sourceReleaseId: storefront.active_release_id,
    reason: "pause",
  });
  if (storefront.active_release_id) {
    statements.push(
      environment.DB.prepare(
        `UPDATE storefront_allocation
            SET remaining_quantity = 0
          WHERE release_id = ?1 AND remaining_quantity > 0`,
      ).bind(storefront.active_release_id),
    );
  }
  statements.push(
    environment.DB.prepare(
      `UPDATE storefront
          SET state = 'paused', updated_at = CURRENT_TIMESTAMP
        WHERE storefront_id = ?1 AND workspace_id = ?2`,
    ).bind(storefrontId, workspaceId),
  );

  try {
    const outcomes = await environment.DB.batch(statements);
    if (outcomes.some((outcome) => !outcome.success)) {
      return json({ error: "pause_unavailable" }, 503);
    }
  } catch {
    const raced = await environment.DB.prepare(
      `SELECT operation_id, storefront_id, workspace_id, source_release_id
         FROM storefront_pause_operation
        WHERE operation_id = ?1`,
    ).bind(operationId).first<PauseOperationRow>();
    if (
      raced && raced.storefront_id === storefrontId && raced.workspace_id === workspaceId
    ) {
      return pauseResponse(environment, raced);
    }
    return json({ error: "pause_conflict" }, 409);
  }

  return pauseResponse(environment, {
    operation_id: operationId,
    storefront_id: storefrontId,
    workspace_id: workspaceId,
    source_release_id: storefront.active_release_id,
  });
}
