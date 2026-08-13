import { ID, MAX_POLL_LIMIT, authorizeDesktop, json } from "./shared";
import type {
  ReceiptRow,
  ReceiptState,
  StorefrontWorkerEnvironment,
} from "./types";

type ReceiptPollRow = {
  relay_sequence: number;
  receipt_id: string;
  storefront_id: string;
  release_id: string;
  idempotency_key: string;
  request_digest: string;
  encrypted_customer: string;
  wrapped_customer_key: string;
  wilaya_code: string;
  delivery_mode: "home" | "desk";
  subtotal_dzd: number;
  shipping_dzd: number;
  total_dzd: number;
  created_at: string;
  shop_id: string;
  storefront_slug: string;
  item_key: string | null;
  quantity: number | null;
  unit_price_dzd: number | null;
};

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
    `WITH selected AS (
       SELECT r.relay_sequence, r.receipt_id, r.storefront_id, r.release_id,
              r.idempotency_key, r.request_digest, r.encrypted_customer,
              r.wrapped_customer_key, r.wilaya_code, r.delivery_mode,
              r.subtotal_dzd, r.shipping_dzd, r.total_dzd,
              strftime('%Y-%m-%dT%H:%M:%fZ', r.created_at) AS created_at,
              s.shop_id, s.slug AS storefront_slug
         FROM storefront_receipt r
         JOIN storefront s ON s.storefront_id = r.storefront_id
        WHERE s.workspace_id = ?1 AND r.relay_sequence > ?2 AND r.state = 'received'
        ORDER BY r.relay_sequence ASC
        LIMIT ?3
     )
     SELECT selected.*, line.item_key, line.quantity, line.unit_price_dzd
       FROM selected
       LEFT JOIN storefront_receipt_line line ON line.receipt_id = selected.receipt_id
      ORDER BY selected.relay_sequence ASC, line.item_key ASC`,
  )
    .bind(workspaceId, after, limit)
    .all<ReceiptPollRow>();
  const receipts = new Map<number, {
    relaySequence: number;
    receiptId: string;
    storefrontId: string;
    storefrontSlug: string;
    shopId: string;
    releaseId: string;
    idempotencyKey: string;
    requestDigest: string;
    encryptedCustomer: string;
    wrappedCustomerKey: string;
    wilayaCode: string;
    deliveryMode: "home" | "desk";
    subtotalDzd: number;
    shippingDzd: number;
    totalDzd: number;
    createdAt: string;
    lines: Array<{ itemKey: string; quantity: number; unitPriceDzd: number }>;
  }>();
  for (const row of rows.results ?? []) {
    let receipt = receipts.get(row.relay_sequence);
    if (!receipt) {
      receipt = {
        relaySequence: row.relay_sequence,
        receiptId: row.receipt_id,
        storefrontId: row.storefront_id,
        storefrontSlug: row.storefront_slug,
        shopId: row.shop_id,
        releaseId: row.release_id,
        idempotencyKey: row.idempotency_key,
        requestDigest: row.request_digest,
        encryptedCustomer: row.encrypted_customer,
        wrappedCustomerKey: row.wrapped_customer_key,
        wilayaCode: row.wilaya_code,
        deliveryMode: row.delivery_mode,
        subtotalDzd: row.subtotal_dzd,
        shippingDzd: row.shipping_dzd,
        totalDzd: row.total_dzd,
        createdAt: row.created_at,
        lines: [],
      };
      receipts.set(row.relay_sequence, receipt);
    }
    if (row.item_key !== null && row.quantity !== null && row.unit_price_dzd !== null) {
      receipt.lines.push({
        itemKey: row.item_key,
        quantity: row.quantity,
        unitPriceDzd: row.unit_price_dzd,
      });
    }
  }
  const receiptList = [...receipts.values()];
  const last = receiptList.at(-1);
  return json({
    receipts: receiptList,
    nextCursor: last?.relaySequence ?? after,
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
