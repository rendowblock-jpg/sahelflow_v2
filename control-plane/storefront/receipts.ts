import { ID, MAX_POLL_LIMIT, authorizeDesktop, json } from "./shared";
import type {
  ReceiptRow,
  ReceiptState,
  StorefrontWorkerEnvironment,
} from "./types";

export async function receiptStatus(
  environment: StorefrontWorkerEnvironment,
  receiptId: string,
): Promise<Response> {
  const receipt = await environment.DB.prepare(
    `SELECT relay_sequence, receipt_id, storefront_id, release_id, idempotency_key,
            request_digest, state, canonical_order_ref, total_dzd, completed_at
       FROM storefront_receipt WHERE receipt_id = ?1`,
  )
    .bind(receiptId)
    .first<ReceiptRow>();
  if (!receipt) return json({ error: "receipt_not_found" }, 404);
  return json({
    receiptId,
    status: receipt.state,
    totalDzd: receipt.total_dzd,
  });
}

export async function pollReceipts(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  const after = Number(url.searchParams.get("after") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  if (
    !ID.test(workspaceId) ||
    !Number.isSafeInteger(after) ||
    after < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_POLL_LIMIT
  ) return json({ error: "invalid_request" }, 400);
  if (!(await authorizeDesktop(request, environment, workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }
  const rows = await environment.DB.prepare(
    `SELECT r.relay_sequence, r.receipt_id, r.storefront_id, r.release_id,
            r.encrypted_customer, r.wrapped_customer_key, r.wilaya_code,
            r.delivery_mode, r.subtotal_dzd, r.shipping_dzd, r.total_dzd, r.created_at
       FROM storefront_receipt r
       JOIN storefront s ON s.storefront_id = r.storefront_id
      WHERE s.workspace_id = ?1 AND r.relay_sequence > ?2 AND r.state = 'received'
      ORDER BY r.relay_sequence ASC LIMIT ?3`,
  )
    .bind(workspaceId, after, limit)
    .all<Record<string, unknown>>();
  const receipts = rows.results ?? [];
  const last = receipts.at(-1);
  return json({
    receipts,
    nextCursor: last ? Number(last.relay_sequence) : after,
  });
}

function isReceiptResultState(value: unknown): value is Exclude<ReceiptState, "received"> {
  return value === "imported" || value === "rejected" || value === "reconciled";
}

export async function completeReceipt(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  receiptId: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const input = body as {
    workspaceId?: unknown;
    state?: unknown;
    canonicalOrderRef?: unknown;
    resultDigest?: unknown;
  };
  const workspaceId = String(input.workspaceId ?? "");
  if (
    !ID.test(workspaceId) ||
    !isReceiptResultState(input.state) ||
    (input.canonicalOrderRef !== undefined && !ID.test(String(input.canonicalOrderRef))) ||
    (input.resultDigest !== undefined &&
      !/^[0-9a-f]{64}$/.test(String(input.resultDigest)))
  ) return json({ error: "invalid_request" }, 400);
  if (!(await authorizeDesktop(request, environment, workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }

  const receipt = await environment.DB.prepare(
    `SELECT r.relay_sequence, r.receipt_id, r.storefront_id, r.release_id,
            r.idempotency_key, r.request_digest, r.state, r.canonical_order_ref,
            r.total_dzd, r.completed_at
       FROM storefront_receipt r
       JOIN storefront s ON s.storefront_id = r.storefront_id
      WHERE r.receipt_id = ?1 AND s.workspace_id = ?2`,
  )
    .bind(receiptId, workspaceId)
    .first<ReceiptRow>();
  if (!receipt) return json({ error: "receipt_not_found" }, 404);

  const canonicalOrderRef =
    input.canonicalOrderRef === undefined ? null : String(input.canonicalOrderRef);
  if (receipt.state !== "received") {
    if (
      receipt.state === input.state &&
      receipt.canonical_order_ref === canonicalOrderRef
    ) return json({ receiptId, status: receipt.state });
    if (!(receipt.state === "imported" && input.state === "reconciled")) {
      return json({ error: "terminal_conflict", status: receipt.state }, 409);
    }
  }

  const result = await environment.DB.prepare(
    `UPDATE storefront_receipt
        SET state = ?1,
            canonical_order_ref = COALESCE(?2, canonical_order_ref),
            result_digest = ?3,
            completed_at = CURRENT_TIMESTAMP
      WHERE receipt_id = ?4`,
  )
    .bind(
      input.state,
      canonicalOrderRef,
      input.resultDigest ?? null,
      receiptId,
    )
    .run();
  if (!result.success || result.meta?.changes === 0) {
    return json({ error: "receipt_completion_conflict" }, 409);
  }
  return json({ receiptId, status: input.state });
}
