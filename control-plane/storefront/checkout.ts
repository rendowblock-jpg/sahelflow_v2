import { parseCheckoutInput } from "./checkout-input";
import { storefrontReceiptAadValue } from "./receipt-protocol";
import { resolveCheckoutPricing } from "./checkout-pricing";
import { authorizePublicCheckout, canonicalJson, json, sha256Hex } from "./shared";
import type {
  D1Statement,
  ReceiptRow,
  StorefrontRow,
  StorefrontWorkerEnvironment,
} from "./types";

export async function checkout(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  slug: string,
): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const limited = await environment.CHECKOUT_RATE_LIMITER.limit({
    key: `checkout:${slug}:${ip}`,
  });
  if (!limited.success) return json({ error: "rate_limited" }, 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const input = parseCheckoutInput(body);
  if (!input) return json({ error: "invalid_checkout" }, 400);

  const storefront = await environment.DB.prepare(
    `SELECT storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key,
            active_release_id, state
       FROM storefront WHERE slug = ?1`,
  )
    .bind(slug)
    .first<StorefrontRow>();
  if (!storefront || storefront.state !== "active" || !storefront.active_release_id) {
    return json({ error: "storefront_not_found" }, 404);
  }
  const expectedAadDigest = await sha256Hex(storefrontReceiptAadValue({
    storefrontId: storefront.storefront_id,
    releaseId: storefront.active_release_id,
    idempotencyKey: input.idempotencyKey,
    wilayaCode: input.wilayaCode,
    deliveryMode: input.deliveryMode,
  }));
  if (input.customerAadDigest !== expectedAadDigest) {
    return json({ error: "customer_binding_mismatch" }, 400);
  }

  const requestDigest = await sha256Hex(
    canonicalJson({
      storefrontId: storefront.storefront_id,
      releaseId: storefront.active_release_id,
      idempotencyKey: input.idempotencyKey,
      encryptedCustomer: input.encryptedCustomer,
      wrappedCustomerKey: input.wrappedCustomerKey,
      wilayaCode: input.wilayaCode,
      deliveryMode: input.deliveryMode,
      items: input.items,
    }),
  );
  const existing = await environment.DB.prepare(
    `SELECT relay_sequence, receipt_id, storefront_id, release_id, idempotency_key,
            request_digest, state, canonical_order_ref, result_digest, total_dzd, completed_at
       FROM storefront_receipt
      WHERE storefront_id = ?1 AND idempotency_key = ?2`,
  )
    .bind(storefront.storefront_id, input.idempotencyKey)
    .first<ReceiptRow>();
  if (existing) {
    if (existing.request_digest !== requestDigest) {
      return json({ error: "idempotency_conflict" }, 409);
    }
    return json({
      receiptId: existing.receipt_id,
      status: existing.state,
      totalDzd: existing.total_dzd,
    });
  }
  if (!(await authorizePublicCheckout(environment, storefront.workspace_id))) {
    return json({ error: "storefront_unavailable" }, 503);
  }

  const pricingResult = await resolveCheckoutPricing(
    environment,
    storefront.active_release_id,
    input.items,
    input.wilayaCode,
    input.deliveryMode,
  );
  if (!pricingResult.ok) {
    return json(
      {
        error: pricingResult.error,
        ...(pricingResult.itemKey ? { itemKey: pricingResult.itemKey } : {}),
      },
      pricingResult.error === "amount_overflow" ? 400 : 409,
    );
  }
  const pricing = pricingResult.pricing;
  const receiptId = `rcpt_${crypto.randomUUID().replace(/-/g, "")}`;
  const statements: D1Statement[] = [
    environment.DB.prepare(
      `INSERT INTO storefront_receipt
        (receipt_id, storefront_id, release_id, idempotency_key, request_digest,
         encrypted_customer, wrapped_customer_key, wilaya_code, delivery_mode,
         subtotal_dzd, shipping_dzd, total_dzd, state)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'received')`,
    ).bind(
      receiptId,
      storefront.storefront_id,
      storefront.active_release_id,
      input.idempotencyKey,
      requestDigest,
      input.encryptedCustomer,
      input.wrappedCustomerKey,
      input.wilayaCode,
      input.deliveryMode,
      pricing.subtotalDzd,
      pricing.shippingDzd,
      pricing.totalDzd,
    ),
  ];
  for (const line of pricing.lines) {
    statements.push(
      environment.DB.prepare(
        `INSERT INTO storefront_receipt_line
          (receipt_id, release_id, item_key, quantity, unit_price_dzd)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(
        receiptId,
        storefront.active_release_id,
        line.itemKey,
        line.quantity,
        line.unitPriceDzd,
      ),
    );
  }
  try {
    const outcomes = await environment.DB.batch(statements);
    if (outcomes.some((outcome) => !outcome.success)) {
      return json({ error: "checkout_unavailable" }, 503);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("allocation_exhausted")) {
      return json({ error: "allocation_unavailable" }, 409);
    }
    const raced = await environment.DB.prepare(
      `SELECT relay_sequence, receipt_id, storefront_id, release_id, idempotency_key,
              request_digest, state, canonical_order_ref, result_digest, total_dzd, completed_at
         FROM storefront_receipt
        WHERE storefront_id = ?1 AND idempotency_key = ?2`,
    )
      .bind(storefront.storefront_id, input.idempotencyKey)
      .first<ReceiptRow>();
    if (raced && raced.request_digest === requestDigest) {
      return json({ receiptId: raced.receipt_id, status: raced.state, totalDzd: raced.total_dzd });
    }
    return json({ error: "checkout_conflict" }, 409);
  }
  return json(
    {
      receiptId,
      status: "received",
      totalDzd: pricing.totalDzd,
      semantic: "received_queued_for_desktop_import",
    },
    202,
  );
}
